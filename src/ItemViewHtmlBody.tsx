import * as React from 'react';
import { AttachmentDictionary } from './Utilities';

interface ItemViewHtmlBodyProps {
    style: React.CSSProperties
    body: string;
    attachments?: AttachmentDictionary;
    plainText?: boolean;
}

export default class ItemViewHtmlBody extends React.Component<ItemViewHtmlBodyProps, any> {
    render() {
        if (this.props.plainText) return <div style={{ ...this.props.style, whiteSpace: 'pre-wrap' }}>{this.props.body}</div>;
        return <iframe title="Message or event body" sandbox="" referrerPolicy="no-referrer"
            style={{ ...this.props.style, width: '100%', height: '65vh', border: 0 }}
            srcDoc={this.parseMessageBody(this.props.body, this.props.attachments)} />;
    }

    private parseMessageBody(html: string, inlineAttachments?: AttachmentDictionary) {
        // A template is inert: even remote images must not load while parsing.
        const template = document.createElement('template');
        template.innerHTML = html;
        const content = template.content;
        content.querySelectorAll('script, iframe, frame, object, embed, link, meta, base, form, a, area').forEach(node => {
            if (node.tagName === 'A') node.replaceWith(...Array.from(node.childNodes));
            else node.remove();
        });

        // Inline attachments
        var inlineImages = content.querySelectorAll<HTMLImageElement>("img");

        [].forEach.call(inlineImages, image => {
            var contentId = (image.getAttribute('src') || '').replace(/^cid:/i, '');
            var attachment = inlineAttachments && inlineAttachments[contentId];
            image.removeAttribute('srcset');
            if (attachment && /^image\/(png|jpeg|gif|webp)$/i.test(attachment.contentType)) {
                image.src = 'data:' + attachment.contentType + ';base64,' + attachment.contentBytes;
            } else {
                image.removeAttribute('src');
                image.alt = image.alt || 'External or unavailable image blocked';
            }
        });

        // The sandbox isolates content from tokens; CSP also blocks tracking and all active content.
        return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"></head><body>'
            + template.innerHTML + '</body></html>';
    }
}
