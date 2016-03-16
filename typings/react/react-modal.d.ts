// Type definitions for React v0.14 (react-dom)
// Project: http://facebook.github.io/react/
// Definitions by: Asana <https://asana.com>, AssureSign <http://www.assuresign.com>, Microsoft <https://microsoft.com>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

/// <reference path="react.d.ts" />

// interface ModalProps {
//     className?: string;
//     closeTimeoutMS?: number;
//     isOpen?: boolean;
//     onRequestClose?(event: any);
// }

declare module "react-modal" {
    function Modal();

    export = Modal;
}
