import * as React from 'react';
import { SelectBox } from './selectbox';


const noOverflowStyle: React.CSSProperties = {
    overflow: 'hidden',
};

const bigStyle: React.CSSProperties = {
    height: '15pt',
    fontSize: '13pt'
}

const smallStyle: React.CSSProperties = {
    height: '12pt',
    fontSize: '10pt'
}

const tightStyle: React.CSSProperties = {
    padding: 0,
    marginTop: 0,
    marginBottom: 0
};

const summaryStyle: React.CSSProperties = {
    padding: 0,
    marginTop: 10,
    marginBottom: 10,
    paddingRight: 15,
    paddingLeft: 15
};

const emphasisStyle: React.CSSProperties = {
    fontWeight: "600"
};

const selectedSummaryStyle = Combine(summaryStyle, {
    backgroundColor: "LightBlue"  
});


function Combine(...styles: React.CSSProperties[]): React.CSSProperties 
{  // Essentially Object.Assign(x,y,...)
    return styles.reduce((previous, style) => {
        return (style != null) ? Object.keys(style).reduce((previous, key) => {
            previous[key] = style[key]; return previous;
        }, previous)
            : previous;
    }, {});
}

interface MailSummaryProps extends React.Props<MailSummary> 
{
    key: string;
    message: Kurve.Message;
    style?: Object;
    selected?: boolean;
    onSelect?(messageId : string);
}

export class MailSummary extends React.Component<MailSummaryProps, any> {
    private handleClick = (e : React.SyntheticEvent) => {
        this.props.onSelect(this.props.message.data.id);
    };
    render() {
        var big = Combine(bigStyle, noOverflowStyle, tightStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, tightStyle, this.props.style);
        var smallBold = Combine(small, emphasisStyle);
        return (
            <div onClick={ this.handleClick } style={ (this.props.selected) ? selectedSummaryStyle : summaryStyle } >
                <p style={ big }>{this.props.message.data.sender.emailAddress.name}</p>
                <p style={ smallBold }>{this.props.message.data.subject}</p>
                <p style={ small }>{this.props.message.data.bodyPreview}</p>
            </div>
        );
    }
}

interface MailListProps extends React.Props<MailList>
{
    data: Kurve.Message[];
    selected? : string;
    onSelection?(id : string);
}

export class MailList extends React.Component<MailListProps, any> {
    constructor(props,state)
    {
      super(props,state);
    }
    private handleSelect = (id: string) => {
        this.props.onSelection(id);
    };
    render() {
        var messageNodes = this.props.data.map((message) => {
            return (<MailSummary  onSelect={this.handleSelect} selected={ this.props.selected === message.data.id}  key={message.data.id} message={message}/>);
        });
        return <div>
            { messageNodes }
            </div>;
    }
}

interface MailProps extends React.Props<Mail> 
{
    data: Kurve.Message[];
    mailboxes: string[];
}

interface MailState 
{
    mailboxFilter: string[];
    selected: string;    
}


export class Mail extends React.Component<MailProps, any>
{
    private values: any[];
    constructor(props, state) {
        super(props, state);
        this.state = { mailboxFilter: [], selected: null };
    }

    private handleMultiChange = (e) => {
        console.log(JSON.stringify(e));
        this.setState({
            mailboxFilter: e
        });
    }
    
    private handleSelection = (id : string) => {
        this.setState({selected: id});
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
            
            <MailList onSelection={ this.handleSelection } selected={this.state.selected } data={ this.props.data } />
          </div>);               
    }
}