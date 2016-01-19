        onmessage = function(e) { 
            var result = "Worker received message: " + e.data; 
            console.log(result);
            self.postMessage('Worker done.'); 
        };