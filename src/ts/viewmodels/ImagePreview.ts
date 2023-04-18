import { qd, type QDObservable } from "../libs/Quickdraw";
import AvailablePrint from "./Image";

export default class ImagePreview {
    visible: QDObservable<boolean>;
    loading: QDObservable<boolean>;
    name: QDObservable<string>;
    source: QDObservable<string>;
    actions: {click: () => void, loaded: () => void, errored: () => void};

    constructor() {
        this.visible = qd.observable(false);
        this.loading = qd.observable(false);
        this.name = qd.observable('');
        this.source = qd.observable('');
        this.actions = {
            click: () => this.clear(),
            loaded: () => this.loadSuccess(),
            errored: () => this.loadFailure(),
        }
    }

    show(image: AvailablePrint) {
        this.name(image.filename);
        this.source(image.jpeg);
        this.loading(true);
        this.visible(true);
    }

    loadSuccess() {
        this.loading(false);
    }

    loadFailure() {
        this.loading(false);
        this.name('Failed to load image preview, click to close.');
    }

    clear() {
        console.log('clear clear')
        this.source('');
        this.visible(false);
    }
}