caps <- NULL

.onLoad <- function(libname, pkgname) {

  path <- system.file(
    package = "rcloud.ipywidgets",
    "javascript",
    "rcloud.ipywidgets.js"
  )

  caps <<- rcloud.support::rcloud.install.js.module(
    "rcloud.ipywidgets",
    paste(readLines(path), collapse = '\n')
  )

  .socket <- .createSocket(.dispatchingSocketInitializer)

  ocaps <- list(
    connect = make_oc(.socket$connect),
    send = make_oc(.socket$receive),
    poll = make_oc(.socket$poll)
  )
  if (!is.null(caps)) caps$init(ocaps)
}

make_oc <- function(x) {
  do.call(base::`:::`, list("rcloud.support", "make.oc"))(x)
}

#'
#' @export
ipy.execute <- function(kernel.name, kernel.id, cmd) {
  caps$execute(Rserve.context(), 'http://localhost:8888', kernel.name, kernel.id, cmd)

# Uncomment the following line if .ocap.idle should be used to push the messages to websocket proxy
# instead of UI actively polling. Note the schedulePoller in rcloud.ipwidgets.js will need to be turned off.
# Note that .ocap.idle results in R session termination after first message is sent by the UI to the socket
# This could be due to the wait on jupyter kernel queues somehow affecting R session.
# .schedule.reader(kernel.id)
}

.logErrors <- function(FUN) {
   function() {
    tryCatch({FUN()}, error = function(e) { .ipy.log(e) })
   }
}

.schedule.reader <- function(kernel.id) {
  reader <- function() {
     .ipy.log('polling for messages')
     msg <- rcloud.jupyter:::rcloud.jupyter.read.msg(kernel.id, rcloud.support:::.session, 1)
     .ipy.log('Received kernel message', msg)
     if(!is.null(msg)) {
       .socket$send(msg)
     }
   }
  .GlobalEnv$.ocap.idle <- .logErrors(reader)
}

.ipy.log <- function(msg, ...) {
  caps$log(paste0(msg, paste0(..., collapse = ', ')))
}

.loggingSocketInitializer <- function(socket) {
  socket$onMessage(function(binary, msg) {
    .ipy.log(msg)
    NULL
  });
  socket$onClose(function() {
   .ipy.log('Closing...')
   NULL
  });
  NULL
}

.dispatchingSocketInitializer <- function(socket) {
  socket$onMessage(function(binary, msg) {
    rcloud.jupyter:::rcloud.jupyter.send.msg(msg$payload, msg$kernelId, rcloud.support:::.session)
  });
  socket$onClose(function() {
   NULL
  });
  NULL
}

.socket <- new.env()

.createSocket <- function(socketInitalizer) {
  .socket <- rcloud.ipywidgets:::.socket
  .socket$appHandlers <- NULL
  .socket$onMessageHandler <- NULL
  .socket$onCloseHandler <- NULL
  .socket$fws <- NULL

  fakeWebSocket <- function() {
    list(
      send = function(msg) {
        caps$on_message(msg);
      },
      onMessage = function(h) {
        .socket$onMessageHandler <- h
      },
      onClose = function(h) {
        .socket$onCloseHandler <- h
      },
      close = function() {

        parentEnv <- parent.frame(2)
        errorVar <- "e"
        errorMsg <- NULL
        # Retrieve error message if socket is closed as a result of unhandled error
        if(exists(errorVar, envir =  parentEnv)) {
          error <- get("e", envir=parentEnv)
          errorMsg <- jsonlite::toJSON(list(type="rcloud-ipy-error", msg=as.character(error)), auto_unbox=TRUE)
        }
        tryCatch(caps$on_close(id, errorMsg), error = function(e) {
          warning(paste("Failed to notify frontend about closed socket: " , e, "\n"))
        })

        tryCatch(.socket$onCloseHandler(), error = function(e) {
          warning(paste("Failed to execute socket onCloseHandler: " , e, "\n"))
        })
      });
  }

  .socket$connect <- function() {
    .socket$fws <- fakeWebSocket()
    socketInitalizer(.socket$fws)
  }

  .socket$receive <- function(msg) {
    .socket$onMessageHandler(FALSE, msg)
  }

  .socket$poll <- function(kernel_id, timeout) {
    message <- rcloud.jupyter:::rcloud.jupyter.read.msg(kernel_id, rcloud.support:::.session, timeout)
    message
  }

  .socket$send <- function(msg) {
    .socket$fws$send(msg)
  }
  .socket
}
