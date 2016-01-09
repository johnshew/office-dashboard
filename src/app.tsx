import * as React from 'react';
import * as ReactDOM from 'react-dom';

interface MailSummaryProps
{
    key : string;
    message : Kurve.Message;
}

class MailSummary extends React.Component<MailSummaryProps, any> {
  render() {
    return <div>
       <h3>{this.props.message.data.sender.emailAddress.name} </h3>
       <p>{this.props.message.data.subject}</p>
       <p>{this.props.message.data.bodyPreview} </p>
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
        return <div className="col-xs-12 col-sm-6 col-lg-4">{messageNodes}</div>;
    }
}

var data : Kurve.MessageDataModel[] = null;

var identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e","http://localhost:8000/login.html");
var graph = new Kurve.Graph({identity: identity});

identity.loginAsync()
        .then((result)=>{
            graph.meAsync()
                .then((me)=> {
                    me.messagesAsync()
                        .then((messages) => {
                            ReactDOM.render(
                                <MailList data={ messages.data} />,
                                document.getElementById('data'));
                        })
                        .fail ((error) => { throw error; });
                })
                .fail((error)=>{ throw error; });
        })
        .fail((error) => { throw error; } );
        