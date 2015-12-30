module AppModule {

    export class App {
        public  initialized = 0;
        constructor() {
            this.initialized = 1;
        }
    }

    var myApp = new App();
}
