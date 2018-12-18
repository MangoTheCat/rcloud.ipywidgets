((function() {

  var socket_ = null;
  var ocaps_ = null;
  var pollers = {};
  // Schedules execution of a function within cell result processing loop to ensure that any UI element referenes used in the function
  // were added to the result pane.
  function executeInCellResultProcessingQueue(context_id, fun) {
    RCloud.session.invoke_context_callback('function_call', context_id, fun);
  }

  function moduleLoader(moduleName, moduleVersion) {
             return new Promise(function(resolve, reject) {
                 var fallback = function(err) {
                   let failedId = err.requireModules && err.requireModules[0];
                   if (failedId) {
                       console.log(`Falling back to unpkg.com for ${moduleName}@${moduleVersion}`);
                       require([`https://unpkg.com/${moduleName}@${moduleVersion}/dist/index.js`], resolve, reject);
                   } else {
                       throw err;
                   }
                 };
                 require([`${moduleName}.js`], resolve, fallback);
             });
         }

  require(['shared.R/rcloud.ipywidgets/built/index.built.js'], () => {});
  var debugEnabled = true;

  function debug(msg, arg) {
    if(debugEnabled) {
      console.debug(msg, arg);
    }
  }

  /**
   * Implement the binary serialization protocol. (Copied from @jupyterlab/services/lib/kernel/serialize as it isn't exported)
   *
   * Serialize Kernel message to ArrayBuffer.
   */
  function serializeBinary(msg) {
      let offsets = [];
      let buffers = [];
      let encoder = new TextEncoder();
      let origBuffers = [];
      if (msg.buffers !== undefined) {
          origBuffers = msg.buffers;
          delete msg['buffers'];
      }
      let jsonUtf8 = encoder.encode(JSON.stringify(msg));
      buffers.push(jsonUtf8.buffer);
      for (let i = 0; i < origBuffers.length; i++) {
          // msg.buffers elements could be either views or ArrayBuffers
          // buffers elements are ArrayBuffers
          let b = origBuffers[i];
          buffers.push(b instanceof ArrayBuffer ? b : b.buffer);
      }
      let nbufs = buffers.length;
      offsets.push(4 * (nbufs + 1));
      for (let i = 0; i + 1 < buffers.length; i++) {
          offsets.push(offsets[offsets.length - 1] + buffers[i].byteLength);
      }
      let msgBuf = new Uint8Array(offsets[offsets.length - 1] + buffers[buffers.length - 1].byteLength);
      // use DataView.setUint32 for network byte-order
      let view = new DataView(msgBuf.buffer);
      // write nbufs to first 4 bytes
      view.setUint32(0, nbufs);
      // write offsets to next 4 * nbufs bytes
      for (let i = 0; i < offsets.length; i++) {
          view.setUint32(4 * (i + 1), offsets[i]);
      }
      // write all the buffers at their respective offsets
      for (let i = 0; i < buffers.length; i++) {
          msgBuf.set(new Uint8Array(buffers[i]), offsets[i]);
      }
      return msgBuf.buffer;
  }

 function cleanUp(obj) {
    let r_attrs = ['r_type', 'r_attributes'];
    if (obj === undefined || obj === null) {
      return obj
    }
    if (typeof(obj) !== 'object') {
      return obj
    }
    var result = obj;
    let allowedAttrs = _.filter(Object.keys(obj), (k) => {
      return r_attrs.indexOf(k) < 0;
    });

    r_attrs.forEach((a) => { delete result[a]; });

    for (i in allowedAttrs) {
      let k = allowedAttrs[i];
      if (typeof(obj[k]) === 'object') {
        result[k] = cleanUp(obj[k]);
      } else if (Array.isArray(obj[k])) {
        result[k] = _.map(obj[k], (e) => {
          return cleanUp(e);
        });
      }
    }
    return result;
  }

  function schedulePoller(kernelId) {
    if(!pollers[kernelId]) {
      pollers[kernelId] = function() {
      ocaps_.pollAsync(kernelId, 1).then(function(msg) {
          if (msg) {
            debug("RECV: ", msg);
            // FIXME: Some ipywidgets modules allow for passing binary data, however there are issues with passing them around between all involved actors:
            // Python, R, OCAPS, JS, this is work-in-progress partial solution.
            if (msg.buffers && !Array.isArray(msg.buffers)) {
              msg.buffers = [msg.buffers];
            }
            _.map(msg.buffers, (k) => {
              var byteCharacters = atob(k);

              var byteNumbers = new Array(byteCharacters.length);
              for (var i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              new Uint8Array(byteNumbers);

            });
            let cleaned = cleanUp(msg);
            let serialized = null;
            if(cleaned.buffers && cleaned.buffers.length > 0) {
              serialized = serializeBinary(cleaned);
            } else {
              serialized = JSON.stringify(cleaned);
            }


            socket_.onmessage({data:serialized});
            setTimeout(pollers[kernelId], 1);
          } else {
            setTimeout(pollers[kernelId], 1000);
          }
          });
      };
      setTimeout(pollers[kernelId], 1000);
    }
  }
  function fakeWebSocket(kernelId) {
    return function() {
        debug(arguments);
        if(socket_) {
          return socket_;
        }
        var fws = {
            readyState: false,
            send: function(msg) {
                debug("To backend: ", JSON.parse(msg));
                ocaps_.sendAsync({ kernelId: kernelId, payload: msg }).then(function(response) {
                    debug("Backend response: ", response);
                });
            }
        };
        socket_ = fws;
        ocaps_.connectAsync().then(function() {
            fws.readyState = true;
            fws.onopen();
        });
        return fws;
    }
  }
  return {
        init: function(ocaps, k) {
           ocaps_ = RCloud.promisify_paths(ocaps, [["connect"], ["send"], ["poll"]]);
            // Are we in the notebook?
            if (RCloud.UI.advanced_menu.add) {
                RCloud.UI.share_button.add({
                    'ipywidgets.html': {
                        sort: 1000,
                        page: 'shared.R/rcloud.ipywidgets/index.html'
                    }
                });

            } else {
              // Do nothing
            }

            k(null, true);
        },

        execute: function(contextId, url, kernelName, kernelId, cmd, k) {
          if(window.RCloud && window.RCloud.ipywidgets) {
            executeInCellResultProcessingQueue(contextId, function(resultdiv) {
              window.RCloud.ipywidgets.execute(url, kernelName, kernelId, cmd, resultdiv, fakeWebSocket(kernelId), {call: function(a,b) {
                console.log(b);
              }}, moduleLoader);

              schedulePoller(kernelId);
              k(null, true);
            })
          } else {
            k({type: 'error', message: 'Illegal state, ipywidgets is not initialized'}, null);
          }
        },

        on_message: function(msg, k) {
          // This is only used if .ocaps.idle is used to push the messages to websocket instead of active polling, see comments in zzz.R
            console.log("FWS msg: ", msg);
            let cleaned = cleanUp(msg);
            socket_.onmessage({data:JSON.stringify(cleaned)});
            k(null, true);
        },
        on_close: function(msg, k) {
            console.log("FWS closing socket: ", msg);
            socket_.onclose();
            k(null, true);
        },
        log: function(content, k) {
          debug("Backend: ", content);
          k(null, true);
        }
    };

})());
