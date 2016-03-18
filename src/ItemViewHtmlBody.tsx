import * as React from 'react';

import * as ScopedStyles from './ScopedStylePolyfill';

interface ItemViewHtmlBodyProps extends React.Props<ItemViewHtmlBody> {
    style: React.CSSProperties
    body?: string;
    attachments?: Kurve.AttachmentDataModel[];
}

export default class ItemViewHtmlBody extends React.Component<ItemViewHtmlBodyProps, any> {
    render() {
        var body = this.props.body || "<img src = '/public/loading.gif' width = '25'' height = '25'/>";
        return <div style={this.props.style} dangerouslySetInnerHTML={  this.parseMessageBody(body, this.props.attachments) } />
    }

    private parseMessageBody(html: string, attachments?: Kurve.AttachmentDataModel[]) {
        var doc = document.implementation.createHTMLDocument("example");
        doc.documentElement.innerHTML = html;

        // Create a new <div/> in the body and move all existing body content to that the new div.
        var resultElement = doc.createElement("div");
        var node: Node;
        while (node = doc.body.firstChild) {
            doc.body.removeChild(node);
            resultElement.appendChild(node);
        }
        doc.body.appendChild(resultElement);

        // Move all styles in <head/> into the new <div/>
        var headList = doc.getElementsByTagName("head");
        if (headList.length == 1) {
            var head = headList.item(0);
            var styles = head.getElementsByTagName("style");
            var styleIndex = styles.length;
            while (styleIndex--) {
                var styleNode = styles.item(styleIndex);
                if (styleNode.parentNode === head) {
                    head.removeChild(styleNode);
                    resultElement.appendChild(styleNode);
                }
            }
        }

        // Inline attachments
        var inlineImages = doc.body.querySelectorAll("img[src^='cid']");
        attachments = attachments || [];

        [].forEach.call(inlineImages, image => {
            var contentId = image.src.replace('cid:', '');
            var attachmentsFound = attachments.filter(attachment => attachment.contentId == contentId);
            var attachment = attachmentsFound && attachmentsFound[0];
            if (attachment) {
                image.src = 'data:' + attachment.contentType + ';base64,' + attachment.contentBytes;
            } else {
                image.src = '/public/loading.gif';
                image.width = 25;
                image.height = 25;
            }
        });

        // Make sure all styles are scoped
        var styles = doc.getElementsByTagName("style");
        var styleIndex = styles.length;
        while (styleIndex--) {
            styles.item(styleIndex).setAttribute("scoped", "");
        }

        ScopedStyles.ScopeStyles(doc.documentElement); // polyfill scoping if necessary

        return { __html: doc.body.innerHTML }
    }
}
