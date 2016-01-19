onmessage = function (message) {
    console.log("Worker received message");
    self.postMessage("Worker result: done");
}