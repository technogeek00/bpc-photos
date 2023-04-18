import { qd, type QDObservableArray } from "../libs/Quickdraw";
import Image from "./Image";
import PrintPackage from "./PrintPackage";
import PrintOrder from "./PrintOrder";
import PrintOrderLineItem from "./PrintOrderLineItem";
import UserAction from "./UserAction";

export default class OrderableImage {
    image: Image;
    parent: PrintOrder;
    packages: QDObservableArray<PrintOrderLineItem>;
    actions: {preview: UserAction, order: UserAction, remove: UserAction};

    constructor(image: Image, packages: PrintPackage[], parent: PrintOrder) {
        this.image = image;
        this.parent = parent;
        this.packages = qd.observableArray(packages.map((detail) => new PrintOrderLineItem(detail, () => parent.orderQuantityChanged())));
        this.actions = {
            preview: new UserAction(() => this.preview()),
            order: new UserAction(() => this.order(), qd.observable(true)),
            remove: new UserAction(() => this.remove())
        }
    }

    preview() {
        this.parent.showPreview(this);
    }

    order() {
        this.actions.order.enabled(false);
        this.parent.addImageToOrder(this);
    }

    remove() {
        this.parent.removeImageFromOrder(this);
        this.packages().forEach((item) => item.reset());
        this.actions.order.enabled(true);
    }
}