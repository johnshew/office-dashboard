import * as React from 'react';

interface MailFolderFilterProps extends React.Props<MailFolderFilter> {
    mailFolders?: Kurve.MailFolderDataModel[];
    selectedMailFolder?: Kurve.MailFolderDataModel;
    onSelect(mailFolder: Kurve.MailFolderDataModel);
}

export default class MailFolderFilter extends React.Component<MailFolderFilterProps, any> {
    private handleMailFolderSelection = (event) => {
        var found = this.props.mailFolders.filter((mf) => { return mf.id === event.target.value; });
        var selected = found.length > 0 ? found[0] : null;
        this.props.onSelect(selected);
    }

    shouldComponentUpdate(nextProps: MailFolderFilterProps) {
        return !(this.props.mailFolders === nextProps.mailFolders && this.props.selectedMailFolder === nextProps.selectedMailFolder);
    }

    render() {
        var mailFolders = this.props.mailFolders
            .sort((a, b) => b.totalItemCount - a.totalItemCount)
            .map(mf =>
                <option key={mf.id} value={mf.id}>{mf.displayName} ({mf.totalItemCount}/{mf.unreadItemCount})</option>
            );

        return (
            <select className="form-control" onChange={this.handleMailFolderSelection} defaultValue={this.props.selectedMailFolder.id}>
                {mailFolders}
            </select>
        );
    }
}
