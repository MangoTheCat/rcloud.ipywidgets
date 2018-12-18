# ipywidgets integration

# Overview
The solution largely builds on the example from jupyter-widgets project: (https://github.com/jupyter-widgets/ipywidgets/tree/master/examples/web3).

For each kernel started by RCloud a JavaScript Kernel model is created and connected to the Kernel's channels via web socket proxy. When a Jupyter cell is executed the cell execution is delegated via CAP to JavaScript Kernel model. The JS Kernel then submits an execution request via WebSocket and consumes messages from the Jupyter Kernel channels and updates the UI.

> Subjective remark - Jupyter cells execution seems more responsive, as there is smaller delay between executing a cell and results appearing in the UI.


# Source code

* rcloud.ipywidgets - https://github.com/MangoTheCat/rcloud.ipywidgets
* rcloud.jupyter changes - https://github.com/MangoTheCat/rcloud/tree/features/rcloud.ipywidgets
* Example notebook - https://github.com/MangoTheCat/rcloud.ipywidgets/blob/master/example_notebook.gist

# Installation Guide

* Deploy rcloud from features/rcloud.ipywidgets  branch
* clone rcloud.ipywidgets repository and run ./mkdist script
* Import example notebook into RCloud
* Run the example


# Supported Features

* Basic layout elements and ipywidgets (e.g. IntSlider, Text)
* multiple views of the same widgets
* jpeg/png outputs
* notebooks with both Python 2 and Python 3 code using ipywidgets

# Not working

The following functionality is known to not work:

* ipywidgets with additional JS dependencies (E.g. Maps from ipyleaflet)
* code completion
* when cell is executed, it is marked as completed before the processing completes (see implementation details)
* RCloud page needs to be refreshed between executions of notebooks with Jupyter cells this is because there isn't a callback registered that destroys JS model and deregisters websocket from previous session
* standard input read


# Implementation Details

## Architecture
* ipywidgets integration currently is implemented with `rcloud.ipywidgets` package. This is inherent from the initial assumption that this feature could be added in non-invasive way. However the analysis revealed that major changes are necessary to `rcloud.jupyter` package to support ipywidgets.

> Suggestion: rcloud.jupter and rcloud.ipywidgets should be merged into single package.

* Some functionality (mainly dealing with ipywidgets and Jupyter JavaScript APIs) is implemented using TypeScript. This was to facilitate development and exploration of Jupyter JS APIs. There is a basic 'mkdist' script that builds the package and compiles TypeScript resources and produces an R package and hiding this complexity.
* The main issue of currently produced package is its size, it should be possible to reduce it significantly by making the compilation aware of the modules that are already available in RCloud core.


## Impacts on RCloud.jupyter:
There is a significant impact on `rcloud.jupyter` and unfortunately it needs rewriting. The reason for this is that the headless
execution of cells that current implementation of `rcloud.jupyter` uses conflicts with the event-based communication of JS kernel used by ipywidgets JS model. `rcloud.jupyter` needs to be refactored so all communication with the kernels is event-based: execution, monitoring, code completion and standard input prompts.

The main complexity is around handling the execution of cell and identifying its completion so both: R backend and ipywidgets don't consume each-other's messages. There might be a need for introducing a single consumer which will then broadcast the messages to various subscribers (ipywidgets websocket and R cell execution thread).


## ipywidgets modules JS dependencies resolution

ipywidgets can define additional JavaScript dependencies which are resolved by the frontend at runtime, the final solution will need to provide a resolver implementation that works in RCloud.

* IPywidgets WidgetManager allows for specifying a JS module resolver delegate, so far very basic resolver was implemented in `rcloud.ipywidgets` which fails to resolve transitive dependencies. The resolution issues need investigating, it is about 1-2 days of work.
* Design of the resolution mechanism also needs investigation to establish locations where the dependencies should be resolved from, there are the following options (could be treated as complementary):
** expose JS libraries included in Python modules installed in Jupyter via RCloud (shared.R)
** include common JS modules in rcloud.ipywidgets/rcloud.jupyter
** fallback to public JS modules repository (current implementation uses https://unpkg.com/ )


## Messaging

### Messages Serialization
Jupyter kernels allow for attaching binary data 'buffers' to messages that ipywidgets can use, the buffers get corrupted in the link between R and Python. A work-in-progress workaround is implemented that converts the buffers to Base64-encoded format and then converts them back to binary array in JS, however this isn't ready yet and better solution should be considered.

### WebSocket Proxy
As opposed to rcloud.shiny websocket proxy where the backend messages are polled by `.GlobalEnv$.ocap.idle` function, rcloud.ipywidgets schedules a JavaScript poller that polls for messages via OCAP. The reason for such solution was to bypass R session termination errors when the former approach was used.

> There are comments in the source code how to switch to `.GlobalEnv$.ocap.idle`
