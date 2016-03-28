import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Modal = require('react-modal');
import Styles from './Styles';

interface AboutProps extends React.Props<About> {
    modalIsOpen: boolean;
    onModalCloseRequest: (event: any) => void;
}

export default class About extends React.Component<AboutProps, {}> {
    constructor(props, state) {
        super(props, state);
        this.state = {};
    }

    private handleModalCloseRequest = (event) => {
        this.props.onModalCloseRequest(event);
    }

    public render() {
        return (
            <Modal
                className="modal-dialog"
                isOpen={this.props.modalIsOpen}
                onRequestClose={this.handleModalCloseRequest}
                style={Styles.modal}
            >
                <div className="modal-dialog">
                    <div className="modal-content">
                        <div className="modal-header">
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
