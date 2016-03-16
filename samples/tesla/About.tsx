import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Modal = require('react-modal');

const modalstyles = {
    overlay: {
        zIndex: 9999
    },
    content: {
        position: null,
        top: 70,
        left: null,
        right: null,
        bottom: null,
        border: null,
        background: null,
        overflow: null,
        WebkitOverflowScrolling: null,
        borderRadius: null,
        padding: null
    }
}

interface AboutProps extends React.Props<About> {
}

interface AboutState {
    modalIsOpen: boolean
}

export default class About extends React.Component<AboutProps, AboutState> {
    constructor(props, state) {
        super(props, state);
        this.state = {
            modalIsOpen: false
        }
    }

    componentDidMount() {
        document.getElementById("ShowAbout").onclick = () => {
            this.setState({ modalIsOpen: true });
        }
    }

    private handleModalCloseRequest = (event) => {
        this.setState({ modalIsOpen: false });
    }

    public render() {
        return (
            <Modal
                className="modal-dialog"
                closeTimeoutMS={150}
                isOpen={this.state.modalIsOpen}
                onRequestClose={this.handleModalCloseRequest}
                style={modalstyles}
            >
                <div className="modal-dialog">
                    <div className="modal-content">
                        <div className="modal-header">
                            <button type="button" className="close" onClick={this.handleModalCloseRequest}>
                                <span aria-hidden="true">&times;</span>
                                <span className="sr-only">Close</span>
                            </button>
                            <h4 className="modal-title">About</h4>
                        </div>
                        <div className="modal-body">
                            <h4>Office Dashboard, Alpha 2</h4>
                            <p>To report bugs or provide feedback go to <br/>
                            <a href="https://github.com/johnshew/office-dashboard/issues">https://github.com/johnshew/office-dashboard/issues</a></p>
                            <p>This is an open source application.  For more information please see the <a href="https://github.com/johnshew/office-dashboard/blob/gh-pages/LICENSE">license</a>.</p>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-default" onClick={this.handleModalCloseRequest}>Close</button>
                        </div>
                    </div>
                </div>
            </Modal>
        );
    }
}
