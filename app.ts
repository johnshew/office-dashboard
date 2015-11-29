module AppModule {

    export class App {
        public initialized = 0;
        constructor() {
            initialized = 1;
        }
    }

    var myApp = new App();

}
