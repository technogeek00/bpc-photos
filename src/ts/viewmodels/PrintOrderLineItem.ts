import PrintPackage from "./PrintPackage";
import { qd, type QDComputed, type QDObservable } from "../libs/Quickdraw";
import UserAction from "./UserAction";
import OrderableImage from "./OrderableImage";

export default class PrintOrderLineItem {
    details: PrintPackage;
    quantityChangeDelegate: () => void;
    parent: OrderableImage;
    price: string;
    quantity: QDObservable<number>;
    total: QDComputed<string>;
    increase: UserAction;
    decrease: UserAction;

    constructor(details: PrintPackage, quantityChangeDelegate: () => void) {
        this.details = details;
        this.quantityChangeDelegate = quantityChangeDelegate;
        this.price = `$${details.price}`;

        this.quantity = qd.observable(0);
        this.total = qd.computed(() => {
            let total = Math.round(this.details.price * this.quantity() * 100) / 100;
            return `$${total}`;
        }, this, [this.quantity]);

        this.increase = new UserAction(() => {
            this.quantity(Math.min(this.details.max, this.quantity() + 1));
            this.quantityChangeDelegate()
        }, qd.computed(() => this.quantity() < this.details.max, this, [this.quantity]));

        this.decrease = new UserAction(() => {
            this.quantity(Math.max(0, this.quantity() - 1));
            this.quantityChangeDelegate()
        }, qd.computed(() => this.quantity() > 0, this, [this.quantity]));
    }

    reset() {
        this.quantity(0);
    }
}