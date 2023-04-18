import { qd, type QDObservable } from "../libs/Quickdraw";

export default class ToastMessage {
    title: QDObservable<string>;
    message: QDObservable<string>;
    visible: QDObservable<boolean>;
    type: QDObservable<string>;
    actions: {clear: () => void};

    constructor() {
        this.title = qd.observable('');
        this.message = qd.observable('');
        this.visible = qd.observable(false);
        this.type = qd.observable('');
        this.actions = {
            clear: () => this.clear()
        }
    }

    show(title: string, message: string, type: string = '') {
        this.title(title);
        this.message(message);
        this.type(type);
        this.visible(true);
    }

    clear() {
        this.title('');
        this.message('');
        this.type('');
        this.visible(false);
    }
}