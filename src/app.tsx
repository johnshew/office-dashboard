import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Mail } from './office';


class App {
    private identity: Kurve.Identity;
    private graph: Kurve.Graph;
    private me: Kurve.User;
    private messages: Kurve.Messages;
    private loginNewWindow: boolean

    constructor() {
        var params = document.location.search && document.location.search.substring(1).split("&").map((kv) => kv.split('=')).reduce((prev, kva) => { prev[kva[0]] = kva[1]; return prev }, {});
        this.loginNewWindow = params && !params["inplace"];
        var here = document.location;
        this.identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e",
            here.protocol + '//' + here.host + here.pathname.substring(0, here.pathname.lastIndexOf('/') + 1) + 'login.html');
        this.graph = new Kurve.Graph({ identity: this.identity });
        document.getElementById("DoLogin").onclick = (e) => app.Login();
        document.getElementById("DoLogout").onclick = (e) => app.Logout();
        document.getElementById("ShowMail").onclick = (e) => app.ShowMail();
        document.getElementById("ShowCalendar").onclick = (e) => app.ShowCalendar();
        document.getElementById("ShowContacts").onclick = (e) => app.ShowContacts();
        document.getElementById("ShowNotes").onclick = (e) => app.ShowNotes();
        if (this.identity.checkForIdentityRedirect()) {
            this.LoggedIn()
        }
        this.UpdateLoginState();
    }

    public Me(): Kurve.Promise<Kurve.User, Kurve.Error> {
        if (this.me) {
            var result = new Kurve.Deferred<Kurve.User, Kurve.Error>();
            result.resolve(this.me);
            return result.promise;
        }
        var promise = this.graph.meAsync();
        promise.then((result) => { this.me = result; });
        return promise;
    }

    public Messages(): Kurve.Promise<Kurve.Messages, Kurve.Error> {
        var result = new Kurve.Deferred<Kurve.Messages, Kurve.Error>();
        if (this.messages) {
            result.resolve(this.messages);
        }
        else {
            this.Me()
                .then(
                (me) => {
                    me.messagesAsync().then((messages) => {
                        this.messages = messages;
                        this.renderMessages();
                        result.resolve(messages);
                    });
                })
                .fail();
        }
        return result.promise;
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
        this.UpdateLoginState();
        this.Messages();
    }

    public Login() {
        if (this.loginNewWindow) {
            this.identity.loginAsync().then(() => this.LoggedIn);
        } else {
            this.identity.loginNoWindowAsync(); // no .then since it will be caught when the page reloads.
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
