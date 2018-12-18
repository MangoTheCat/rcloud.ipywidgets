declare global {
    interface Window { RCloud: any; }
}

window.RCloud = window.RCloud || {};

import {
    WidgetManager
} from './manager';

import {
    Kernel, ServerConnection, KernelMessage
} from '@jupyterlab/services';

import * as pWidget from '@phosphor/widgets';

import _ = require('underscore');


    if (!window.RCloud.ipywidgets) {
      window.RCloud.ipywidgets = {};
    }

    window.RCloud.ipywidgets.execute = (baseurl, kernelName, kernelId, code, resultdiv, websocket, fetch, moduleLoader) => {

      if (!window.RCloud.ipywidgets.kernel) {

        let wsurl = 'ws:' + baseurl.split(':').slice(1).join(':');
        let connectionInfo = ServerConnection.makeSettings({
            baseUrl: baseurl,
            wsUrl: wsurl,
            WebSocket: websocket,
            fetch: fetch
        });
        window.RCloud.ipywidgets.kernel = Kernel.connectTo({id: kernelId,
                 name: kernelName}, connectionInfo);

        let options = { loader: moduleLoader };
        window.RCloud.ipywidgets.widgetManager = new WidgetManager(options, window.RCloud.ipywidgets.kernel);
      }

      let displayContent = (msg) => {
            if (msg.content.data['text/html']) {
              $(widgetarea).append($(msg.content.data['text/html'].toString()));
            } else if (msg.content.data['image/png']) {
              let imgData = 'data:image/png;base64,'+ msg.content.data['image/png'];
              $(widgetarea).append($('<img src="' +  imgData + '">'));
            } else if (msg.content.data['image/jpeg']) {
              let imgData = 'data:image/jpeg;base64,'+ msg.content.data['image/jpeg'];
              $(widgetarea).append($('<img src="' +  imgData + '">'));
            } else if (msg.content.data['application/json']) {
              $(widgetarea).append($('<pre>' + msg.content.data['application/json'] + '</pre>'));
            } else {
              $(widgetarea).append($('<p>' + msg.content.data['text/plain'] + '</p>'));
            }
      }
          // Create the widget area and widget manager
          let widgetarea = resultdiv[0] as HTMLElement;
          let widgetManager = window.RCloud.ipywidgets.widgetManager;

            // Run backend code to create the widgets.  You could also create the
            // widgets in the frontend, like the other widget examples demonstrate.
            let execution = window.RCloud.ipywidgets.kernel.requestExecute({ code: code });
            execution.onIOPub = (msg) => {
                // If we have a display message, display the widget.
                if (KernelMessage.isDisplayDataMsg(msg)) {
                    let widgetData: any = msg.content.data['application/vnd.jupyter.widget-view+json'];
                    if (widgetData !== undefined && widgetData.version_major === 2) {
                        let model = widgetManager.get_model(widgetData.model_id);
                        if (model !== undefined) {
                            model.then(model => {
                                widgetManager.display_model(msg, model).then((view) => {
                                    pWidget.Widget.attach(view.pWidget, widgetarea);
                                    view.on('remove', function() {
                                        console.log('view removed', view);
                                    });
                                    return view;
                                });
                            });
                        }
                    } else {
                      displayContent(msg);
                    }
                } else if (KernelMessage.isExecuteResultMsg(msg)) {
                  displayContent(msg);
               } else if(KernelMessage.isErrorMsg(msg)) {
                  let pre = $('<pre></pre>');
                  let current_error_ = $('<code style="color: crimson"></code>');
                  pre.append(current_error_);
                  current_error_.append(_.escape(msg.content.ename + ':' + msg.content.evalue));
                   $(widgetarea).append(current_error_);
               } else {
                  console.log(msg.content);
               }
            };

    }
