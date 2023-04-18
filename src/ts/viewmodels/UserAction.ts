import { type QDObservable, type QDComputed } from "../libs/Quickdraw";

export default class UserAction {
    click: () => void;
    enabled: QDObservable<boolean> | QDComputed<boolean>;

    constructor(click: () => void, enabled: QDComputed<boolean> = () => true) {
        this.click = click;
        this.enabled = enabled;
    }
}
