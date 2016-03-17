// Type definitions for react-router v2.0.0
// Project: https://github.com/rackt/react-router
// Definitions by: Sergey Buturlakin <https://github.com/sergey-buturlakin>, Yuichi Murata <https://github.com/mrk21>, Václav Ostrožlík <https://github.com/vasek17>, Nathan Brown <https://github.com/ngbrown>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference path="../react/react.d.ts" />

declare namespace ReactModal {
    import React = __React

    interface ModalStyle {
        overlay?: React.CSSProperties,
        content?: React.CSSProperties
    }

    interface ModalProps extends React.Props<Modal> {
        className?: string,
        closeTimeoutMS?: number,
        isOpen: boolean,
        onRequestClose: (event: any) => void,
        style?: ModalStyle
    }
    interface Modal extends React.ComponentClass<ModalProps> {}
    const Modal: Modal
}

declare module "react-modal" {
    export = ReactModal.Modal;
}
