import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { MailList } from './office';
import { SelectBox } from './selectbox';

class App {
    private identity: Kurve.Identity;
    private graph: Kurve.Graph;
    private me: Kurve.User;
    private messages: Kurve.Messages;

    constructor() {
        this.identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e", "http://localhost:8000/login.html");
        this.graph = new Kurve.Graph({ identity: this.identity });
        document.getElementById("DoLogin").onclick = (e) => app.Login();
        document.getElementById("DoLogout").onclick = (e) => app.Logout();
        document.getElementById("ShowMail").onclick = (e) => app.ShowMail();
        document.getElementById("ShowCalendar").onclick = (e) => app.ShowCalendar();
        document.getElementById("ShowContacts").onclick = (e) => app.ShowContacts();
        document.getElementById("ShowNotes").onclick = (e) => app.ShowNotes();
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

    public Login() {
        this.identity.loginAsync().then(() => {
            this.UpdateLoginState();
            this.Messages();
        });
    }
    public Logout() { 
        this.identity.logOut();
        this.UpdateLoginState();  
    };

    private handleMultiChange = (e) => {
        console.log(JSON.stringify(e));
    }

    private ShowMail()
    {
            ReactDOM.render(<Mail data={ this.messages.data } mailboxes={["inbox","sent items"]}/>, document.getElementById('Mail'));
    }
    
    private ShowCalendar()
    {
        
    }
    
    private ShowContacts()
    {
        
    }
    
    private ShowNotes()
    {
        
    }
    
    private renderMessages() {
        this.ShowMail();
    }
}

interface MailProps extends React.Props<any> {
    data: Kurve.Message[];
    mailboxes: string[];
}

class Mail extends React.Component<MailProps, any>
{
    private values: any[];
    constructor(props, state) {
        super(props, state);
        this.state = { mailboxFilter: [] };
    }

    private handleMultiChange = (e) => {
        console.log(JSON.stringify(e));
        this.setState({
            mailboxFilter: e
        });
    }

    render() {
        var options = this.props.mailboxes.map((mailboxName)=>{
            return <option value={mailboxName}>{mailboxName}</option>
        });
        
        return (
          <div>
            <SelectBox label="All Mailboxes" onChange={this.handleMultiChange} value={this.state.mailboxFilter} multiple={true}>
                {options}
            </SelectBox>
            
            <MailList data={ this.props.data } />
          </div>);               
    }
}

var app = new App();
