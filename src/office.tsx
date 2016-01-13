import * as React from 'react';
import { SelectBox } from './selectbox';


const noOverflowStyle: React.CSSProperties = {
    overflow: 'hidden',
};

const bigStyle: React.CSSProperties = {
    height: '16pt',
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
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 15,
    paddingLeft: 15
};

const emphasisStyle: React.CSSProperties = {
    fontWeight: "600"
};

const selectedSummaryStyle = Combine(summaryStyle, {
    backgroundColor: "LightBlue"
});

const mailViewStyle: React.CSSProperties = {
    paddingRight: 0,
    paddingLeft: 0
}

const mailListStyle: React.CSSProperties = {
    minHeight: "100vh",
    borderRight: "thin solid",
    paddingRight: 0,
    paddingLeft: 0
}

function Combine(...styles: React.CSSProperties[]): React.CSSProperties {  // Essentially Object.Assign(x,y,...)
    return styles.reduce((previous, style) => {
        return (style != null) ? Object.keys(style).reduce((previous, key) => {
            previous[key] = style[key]; return previous;
        }, previous)
            : previous;
    }, {});
}

interface MailSummaryProps extends React.Props<MailSummary> {
    key: string;
    message: Kurve.Message;
    style?: Object;
    selected?: boolean;
    onSelect?(messageId: string);
}

export class MailSummary extends React.Component<MailSummaryProps, any> {
    private handleClick = (e: React.SyntheticEvent) => {
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

interface MailListProps extends React.Props<MailList> {
    data: Kurve.Message[];
    selected?: string;
    onSelection?(id: string);
}

export class MailList extends React.Component<MailListProps, any> {
    constructor(props, state) {
        super(props, state);
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

interface MessageViewProps extends React.Props<MessageView> {
    message: Kurve.Message;
    style?: React.CSSProperties;
}

function CleanUp(html: string) {
    var doc = document.implementation.createHTMLDocument("example");
    doc.documentElement.innerHTML = html;
    var style = doc.getElementsByTagName("style");
    var body = doc.body;

    for (var i = 0; i < style.length; i++) {
        style.item(i).setAttribute("scoped", "");
    }
    document.getElementById("Temp").appendChild(doc); // force browsers to process innerHTML
    var result = ScopeStyles(doc);
    return { __html: doc.body.innerHTML }
}

class TypeError {
    private message;
    private data;
    constructor(message, data?) {
        this.message = message;
        this.data = data;
    }
}

function ScopeCapabilities() {
    var doc = document;
    var check = document.createElement('style');
    var DOMStyle = ('undefined' !== typeof check.sheet) ? 'sheet' : ('undefined' !== typeof check["getSheet"]) ? 'getSheet' : 'styleSheet';
    var scopeSupported = 'undefined' !== typeof check["scope"];
    
    // we need to append it to the DOM because the DOM element at least FF keeps NULL as a sheet utill appended
    // and we can't check for the rules / cssRules and changeSelectorText untill we have that
    doc.body.appendChild(check);
    var testSheet = check[DOMStyle];

    // add a test styleRule to be able to test selectorText changing support
    // IE doesn't allow inserting of '' as a styleRule
    testSheet.addRule ? testSheet.addRule('c', 'blink') : testSheet.insertRule('c{}', 0);

    // store the way to get to the list of rules
    var DOMRules = testSheet.rules ? 'rules' : 'cssRules';

    // cache the test rule (its allways the first since we didn't add any other thing inside this <style>
    var testStyle = testSheet[DOMRules][0];

    // try catch it to prevent IE from throwing errors
    // can't check the read-only flag since IE just throws errors when setting it and Firefox won't allow setting it (and has no read-only flag
    try {
        testStyle.selectorText = 'd';
    } catch (e) { }
    
    // check if the selectorText has changed to the value we tried to set it to
    // toLowerCase() it to account for browsers who change the text
    var changeSelectorTextAllowed = 'd' === testStyle.selectorText.toLowerCase();

    // remove the <style> to clean up
    check.parentNode.removeChild(check);

    // return the object with the appropriate flags
    return {
        scopeSupported: scopeSupported
        , rules: DOMRules
        , sheet: DOMStyle
        , changeSelectorTextAllowed: changeSelectorTextAllowed
    };

}

const compat = ScopeCapabilities();

function ScopeStyles(doc) {
    // scope is supported? just return a function which returns "this" when scoped support is found to make it chainable for jQuery
    if (compat.scopeSupported) {
        return function() { return this };
    }

    var scopedSheets : NodeListOf<Element>;

    if (doc.querySelectorAll) {
        scopedSheets = doc.querySelectorAll('style[scoped]');
    } else {
        scopedSheets = doc.getElementsByTagName('style');
    }

    var i = scopedSheets.length;
    while (i--) {
        var scoped = scopedSheets[i].getAttribute('scoped'); 
        if (scoped != null) { ScopeStyleTag(scopedSheets[i]); }
    }

    return ScopeStyleTag;
}

function ScopeStyleTag(styleNode : Element) {
    var glue = '';
    var appliedAttributeTag = 'data-scopedpolyfill-applied';
    var par = styleNode.parentNode as Element;  //!TODO Should check

    if ('STYLE' !== styleNode.nodeName) {
        throw new TypeError('Supplied styleNode is not of type style', styleNode);
    }
    
    if (styleNode.hasAttribute(appliedAttributeTag)) {
        // Scoped styles already applied, silently skipping.
        return;
    }

    window.console && console.log("No support for <style scoped> so jumping through hoops for " + styleNode.nodeValue);
    
    // init some vars
    var parentSheet = styleNode[compat.sheet];

    if (!parentSheet) {
        // Likely that the style tag has not yet been inserted into DOM.
        throw new TypeError('Style node has no ' + compat.sheet + ' property, ' +
            (!par ? 'cause is that supplied style tag is not present in DOM, ' : '') +
            'cannot continue.');
    }

    var allRules = parentSheet[compat.rules];
    var index = allRules.length || 0;
    var idCounter = 0;
    
    if (!par.id) {
        idCounter += 1;
        par.id = 'scopedByScopedPolyfill_' + idCounter;
    }

    // get al the ids from the parents so we are as specific as possible
    // if no ids are found we always have the id which is placed on the <style>'s parentNode
    while (par) {

        if (par.id)
            //if id begins with a number, we have to apply css escaping
            if (parseInt(par.id.slice(0, 1))) {
                glue = '#\\3' + par.id.slice(0, 1) + ' ' + par.id.slice(1) + ' ' + glue;
            } else {
                glue = '#' + par.id + ' ' + glue;
            }

        par = par.parentNode as Element; //!TODO should check
    }

    // iterate over the collection from the end back to account for IE's inability to insert a styleRule at a certain point
    // it can only add them to the end...
    while (index--) {
        var rule = allRules[index];
        ScopeCssRules(parentSheet, rule, index, glue);
    }
    
    styleNode.setAttribute(appliedAttributeTag, "true");
}

//recursively process cssRules
function ScopeCssRules(parentSheet, parentRule, index, parentSelector : string) 
{
    var sheet = parentRule.cssRules ? parentRule : parentSheet
    var allRules = parentRule.cssRules || [parentRule]
    var i = allRules.length || 0
    var ruleIndex = parentRule.cssRules ? i : index;
         
    // iterate over the collection from the end back to account for IE's inability to insert a styleRule at a certain point
    // it can only add them to the end...
    while (i--) {

        var rule = allRules[i];
        if (rule.selectorText) {
            var selector = parentSelector + ' ' + rule.selectorText.split(',').join(', ' + parentSelector);
            // replace :root by the scoped element
            selector = selector.replace(/[\ ]+:root/gi, '');
            
            window.console && console.log('Adding ' + selector + ' to ' + rule.style.cssText);
            
            if (compat.changeSelectorTextAllowed) {
                rule.selectorText = selector;
            } else {// or we need to remove the rule and add it back in if we cant edit the selectorText       
                /* IE only adds the normal rules to the array (no @imports, @page etc)
                 * and also does not have a type attribute so we check if that exists and execute the old IE part if it doesn't
                 * all other browsers have the type attribute to show the type
                 *  1 : normal style rules  <---- use these ones
                 *  2 : @charset
                 *  3 : @import
                 *  4 : @media
                 *  5 : @font-face
                 *  6 : @page rules
                 */
                if (!rule.type || 1 === rule.type) {
                    var styleRule = rule.style.cssText;
                    // IE doesn't allow inserting of '' as a styleRule
                    if (styleRule) {
                        sheet.removeRule ? sheet.removeRule(ruleIndex) : sheet.deleteRule(ruleIndex);
                        sheet.addRule ? sheet.addRule(selector, styleRule, ruleIndex) : sheet.insertRule(selector + '{' + styleRule + '}', ruleIndex);
                    }
                }
            }
        } else if (rule.cssRules) {
            ScopeCssRules(parentSheet, rule, ruleIndex, parentSelector);
        }
    }
    window.console && console.log("Updated sheet: " + sheet.ownerNode.innerHtml);
    //!BUG when we get here looking at sheet.rules or sheet.cssRules shows the modified rules.  But looking at sheet.ownerNode.innerHTML has the unmodified version.
    return sheet;
}


export class MessageView extends React.Component<MessageViewProps, any>
{
    private check(text: string) {
        return (text != null) ? text : "";
    }

    private toLine() {
        var x: any[] = this.props.message.data.toRecipients;
        return x.reduce((p, c) => {
            var result = ((p != null) ? p + '; ' : 'To: ') + c.emailAddress.name;
            return result;
        }, null);
    }

    render() {
        var big = Combine(bigStyle, noOverflowStyle, this.props.style);
        var small = Combine(smallStyle, noOverflowStyle, this.props.style);
        var smallEmphasis = Combine(smallStyle, emphasisStyle, noOverflowStyle, this.props.style);
        var smallScrolling = Combine(smallStyle, this.props.style);
        var subject = this.props.message && this.props.message.data.subject || "";
        var from = this.props.message && this.props.message.data.sender.emailAddress.name || "";
        var toRecipients = this.props.message && this.toLine() || "";
        var body = this.props.message && this.props.message.data.body["content"] || ""; //TODO Fix Kurve
        return (
            <div>
              <div className="well" style={  { padding: 10 } }>
                <p style={ big }>{from}</p>
                <p style={ smallEmphasis }>{subject}</p>
                <p style={ small }>{toRecipients}</p>
                  </div>
              <div style={  { paddingRight: 10, paddingLeft: 10 } } dangerouslySetInnerHTML={ CleanUp(body) }>
                  </div>
                </div>
        );
    }
}

interface MailProps extends React.Props<Mail> {
    data: Kurve.Message[];
    mailboxes: string[];
}

interface MailState {
    mailboxFilter?: string[];
    selected?: string;
}

export class Mail extends React.Component<MailProps, MailState>
{
    private values: any[];
    constructor(props, state) {
        super(props, state);
        this.state = { mailboxFilter: [], selected: null };
    }

    private handleMultiChange = (e: string[]) => {
        console.log(JSON.stringify(e));
        this.setState({
            mailboxFilter: e
        });
    }

    private handleSelection = (id: string) => {
        this.setState({ selected: id });
    }

    private selectedMessage(): Kurve.Message {
        var found = this.props.data.filter((message) => (message.data.id === this.state.selected));
        return (found.length > 0) ? found[0] : null;
    }

    render() {
        var options = this.props.mailboxes.map((mailboxName) => {
            return <option value={mailboxName}>{mailboxName}</option>
        });

        return (
            <div>
            <div className="col-xm-12 col-sm-6 col-lg-3" style={ mailListStyle }>
                <div>
                    <MailList onSelection={ this.handleSelection } selected={this.state.selected } data={ this.props.data } />
                    </div>
                </div>
            <div className="col-sm-12 col-sm-6 col-lg-9" style={ mailViewStyle }>
                <MessageView message={this.selectedMessage() }/>
                </div>
                </div>
        );
    }
}

/*
                    <SelectBox label="All Mailboxes" onChange={this.handleMultiChange} value={this.state.mailboxFilter} multiple={true}>
                        {options}
                    </SelectBox>                        
*/