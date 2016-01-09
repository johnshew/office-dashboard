import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as SelectBox from './selectbox';

interface MailSummaryProps
{
    key : string;
    message : Kurve.Message;
}

class MailSummary extends React.Component<MailSummaryProps, any> {
  render() {
    return <div className="well tight">
       <h3 className="tight">{this.props.message.data.sender.emailAddress.name}</h3>
       <p className="tight">{this.props.message.data.subject}</p>
       <p className="tight">{this.props.message.data.bodyPreview}</p>
    </div>;
  }
}

interface MailListProps 
{
    data : Kurve.Message[];
}

class MailList extends React.Component<MailListProps,any> {
    render() {
        var messageNodes = this.props.data.map((message) => {
            return (<MailSummary  key={message.data.id} message={message}/>); 
        });
        return <div className="col-xs-12 col-sm-6 col-lg-4">
            { messageNodes }
        </div>;
    }
}

class App 
{
  private identity : Kurve.Identity;
  private graph : Kurve.Graph;
  private me : Kurve.User;
  private messages : Kurve.Messages;
  
  constructor() {
      this.identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e","http://localhost:8000/login.html");
      this.graph = new Kurve.Graph({identity: this.identity});  
  }    
  
  public Me() : Kurve.Promise<Kurve.User,Kurve.Error>
  {
      if (this.me) {
          var result = new Kurve.Deferred<Kurve.User, Kurve.Error>();
          result.resolve(this.me);
          return result.promise;
      }
      var promise = this.graph.meAsync();
      promise.then((result) => { this.me = result; });
      return promise;
  }
  
  public Messages() : Kurve.Promise<Kurve.Messages, Kurve.Error>
  {
    var result = new Kurve.Deferred<Kurve.Messages,Kurve.Error>();
    if (this.messages) { result.resolve(this.messages); }
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
  
  public Login() {
      this.identity.loginAsync().then(()=>{
          this.Messages();
      });
  }
  public Logout() { this.identity.logOut()};
  
  private renderMessages() 
  {
    ReactDOM.render(<MailList data={ this.messages.data } />, document.getElementById('data'));
  }
  
}

var app = new App();
document.getElementById("LoginButton").onclick = (e) => app.Login();
document.getElementById("LogoutButton").onclick = (e) => app.Logout();

        