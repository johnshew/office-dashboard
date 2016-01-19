import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Mail } from './office';

var forceInPlaceLogin = true;

class App {
    private identity: Kurve.Identity;
    private graph: Kurve.Graph;
    private me: Kurve.User;
    private messages: Kurve.Messages;
    private loginNewWindow: boolean

    constructor() {
        console.log('App initializing');
        
        var here = document.location;
        this.identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e",
            here.protocol + '//' + here.host + here.pathname.substring(0, here.pathname.lastIndexOf('/') + 1) + '../public/login.html');
        this.graph = new Kurve.Graph({ identity: this.identity });
        this.me = null;
        this.messages = null;

        var params = document.location.search.replace(/.*?\?/,"").split("&").map(function (kv) { return kv.split('='); }).reduce(function (prev, kva) { prev[kva[0]] = (!kva[1]) ? true : kva[1]; return prev }, {});

        this.loginNewWindow = !forceInPlaceLogin && !params["inplace"]; 
        console.log('In place login is ' + !this.loginNewWindow);

        document.getElementById("DoLogin").onclick = (e) => app.Login();
        document.getElementById("DoLogout").onclick = (e) => app.Logout();
        document.getElementById("ShowMail").onclick = (e) => app.ShowMail();
        document.getElementById("ShowCalendar").onclick = (e) => app.ShowCalendar();
        document.getElementById("ShowContacts").onclick = (e) => app.ShowContacts();
        document.getElementById("ShowNotes").onclick = (e) => app.ShowNotes();

        console.log('Checking for identity redirect');
        if (this.identity.checkForIdentityRedirect()) {
            this.LoggedIn()
        }
        this.UpdateLoginState();
    }

    public GetMe(): Kurve.User {
        if (this.me) {
            return this.me;
        }
        console.log('Getting me');
        this.graph.meAsync().then((result) => {
            console.log("Got me."); 
            this.me = result; 
        });
        return null;
    }

    public GetMessages() {
        if (this.messages) {
            return;
        } else {
            console.log('Getting me');
            this.graph.meAsync()
                .then((me) => {
                    this.me = me;
                    console.log('Got me.  Now getting messages.');
                    me.messagesAsync().then((messages) => {
                        console.log('Got messages.  Now rendering.');
                        this.messages = messages;
                        this.renderMessages();                        
                    });
                })
                
        }        
    }

    public UpdateLoginState() {
        if (this.identity.isLoggedIn()) {
            document.getElementById("DoLogin").style.display = "none";
            document.getElementById("DoLogout").style.display = "inherit";
        } else {
            document.getElementById("DoLogin").style.display = "inherit";
            document.getElementById("DoLogout").style.display = "none";
        }
    }

    public LoggedIn() {
        console.log('Successful login.');
        this.UpdateLoginState();
        this.GetMessages();
    }

    public IsLoggedIn() : boolean {
        return this.identity.isLoggedIn();
    }        

    public Login() {
        console.log('Login called');
        if (this.loginNewWindow) {
            this.identity.loginAsync()
            .then(() => { 
                this.LoggedIn();
            });
        } else {
            this.identity.loginNoWindow((error) => {
                console.log('LoginNoWindow failed.');
            }); // no .then since it will be caught when the page reloads.
        }
    }
    
    public Logout() {
        this.identity.logOut();
        this.UpdateLoginState();
    };

    private handleMultiChange = (e) => {
        console.log(JSON.stringify(e));
    }

    private ShowMail() {
        ReactDOM.render(<Mail data={ this.messages.data } mailboxes={["inbox", "sent items"]}/>, document.getElementById('Mail'));
    }

    private ShowCalendar() {

    }

    private ShowContacts() {

    }

    private ShowNotes() {

    }

    private renderMessages() {
        this.ShowMail();
    }
}

var app = new App();
window["MyApp"] = app;
