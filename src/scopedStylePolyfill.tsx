
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


class TypeError {
    private message;
    private data;
    constructor(message, data?) {
        this.message = message;
        this.data = data;
    }
}
export function ScopeStyles(doc) {
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
