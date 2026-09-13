import * as React from 'react';
import { AttachmentDictionary } from './Utilities';

interface ItemViewHtmlBodyProps {
    style: React.CSSProperties
    body: string;
    attachments?: AttachmentDictionary;
    plainText?: boolean;
    fitContainer?: boolean;
    showImages?: boolean;
}

export default class ItemViewHtmlBody extends React.Component<ItemViewHtmlBodyProps, any> {
    render() {
        if (this.props.plainText) return <div className={this.props.fitContainer ? 'message-plain-body' : undefined}
            style={{ ...this.props.style, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{this.props.body}</div>;
        return <iframe title="Message or event body" sandbox="" referrerPolicy="no-referrer"
            className={this.props.fitContainer ? 'message-html-body' : undefined}
            style={{ ...this.props.style, width: '100%', height: this.props.fitContainer ? '100%' : '65vh', border: 0 }}
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
            image.setAttribute('referrerpolicy', 'no-referrer');
            let remoteUrl: URL;
            try { remoteUrl = new URL(image.getAttribute('src') || ''); } catch { }
            if (attachment && /^image\/(png|jpeg|gif|webp)$/i.test(attachment.contentType)) {
                image.src = 'data:' + attachment.contentType + ';base64,' + attachment.contentBytes;
            } else if (this.props.showImages && remoteUrl?.protocol === 'https:' && !remoteUrl.username && !remoteUrl.password) {
                image.src = remoteUrl.href;
            } else {
                if (!image.alt?.trim()) { image.remove(); return; }
                const placeholder = document.createElement('span');
                placeholder.textContent = 'Image blocked';
                placeholder.title = image.alt;
                placeholder.setAttribute('role', 'img');
                placeholder.setAttribute('aria-label', `Blocked image: ${image.alt}`);
                placeholder.style.cssText = 'display:inline-block;max-width:100%;font:12px/1.5 sans-serif;color:#586068;background:#f2f4f5;border:1px solid #d8dde0;border-radius:3px;padding:2px 6px;overflow-wrap:anywhere;';
                image.replaceWith(placeholder);
            }
        });

        const imageSources = this.props.showImages ? 'data: https:' : 'data:';
        return '<!doctype html><html><head><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src ' + imageSources + '; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"></head><body>'
            + template.innerHTML + '<style>html{overflow-wrap:anywhere}body{margin:0;padding:16px;box-sizing:border-box}img,table{max-width:100%!important}img{height:auto!important}table{box-sizing:border-box}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></body></html>';
    }
}
