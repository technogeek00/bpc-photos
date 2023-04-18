import { qd, type QDObservable, type QDComputed, type QDObservableArray } from "../libs/Quickdraw";
import Image from "./Image";
import PrintPackage from "./PrintPackage";
import ImagePreview from "./ImagePreview";
import OrderableImage from "./OrderableImage";
import ToastMessage from "./ToastMessage";
import UserAction from "./UserAction";

export default class PrintOrder {
    subject: PhotoSubject;
    packages: PrintPackage[];
    orderableImages: OrderableImage[];
    order: QDObservableArray<OrderableImage>;
    orderHasItems: QDComputed<boolean>;
    preview: ImagePreview;
    actions: {order: UserAction};
    submitting: QDObservable<boolean>;
    submissionToast: ToastMessage;
    totalPrice: QDObservable<string>;
    downloadAll: string;

    constructor(images: Image[], packages: PrintPackage[], subject: PhotoSubject) {
        this.packages = packages;
        this.subject = subject;
        this.orderableImages = images.map((image) => new OrderableImage(image, packages, this));
        this.order = qd.observableArray();
        this.orderHasItems = qd.computed(() => this.order().length > 0, this, [this.order]);
        this.preview = new ImagePreview();
        this.submitting = qd.observable(false);
        this.submissionToast = new ToastMessage();
        this.totalPrice = qd.observable('$0.00');
        this.downloadAll =  `/view/${subject.id}/images/download?token=${subject.token}`;
        this.actions = {
            order: new UserAction(() => this.placeOrder(), qd.computed(() => !this.submitting(), this, [this.submitting]))
        }
    }

    addImageToOrder(image: OrderableImage) {
        this.order.push(image);
        this.order.sort((a, b) => a.image.name.localeCompare(b.image.name))
    }

    removeImageFromOrder(image: OrderableImage) {
        this.order.remove(image);
    }

    showPreview(image: OrderableImage) {
        this.preview.show(image.image);
    }

    orderQuantityChanged() {
        let totalPrice = this.order().reduce((sum, image) => {
            return image.packages().reduce((sum, item) => {
                return sum + (item.details.price * item.quantity())
            }, sum);
        }, 0);
        totalPrice = Math.round(totalPrice * 100) / 100;
        let padding = (totalPrice * 100 % 100 == 0) ? '.00' : (totalPrice * 100 % 10 == 0) ? '0' : '';
        this.totalPrice(`$${totalPrice}${padding}`);
    }

    placeOrder() {
        this.submitting(true);
        this.submissionToast.clear();
        this.actions.order.enabled(false);
        let postableOrder = this.order().map((image) => {
            return {
                id: image.image.name,
                packages: image.packages().map((lineItem) => {
                    return {
                        name: lineItem.details.name,
                        quantity: lineItem.quantity()
                    }
                }).filter((lineItem) => lineItem.quantity > 0)
            }
        });

        // todo - ensure there is some quantity listed
        fetch(`/order/${this.subject.id}?token=${this.subject.token}`, {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    order: postableOrder
                })
            })
            .then((response) => response.json())
            .then((result) => {
                this.submitting(false);
                if(result.success) {
                    this.order.removeAll();
                    this.submissionToast.show('Order Submitted', 'You will recieve a confirmation email within 48 hours.', 'success');
                } else {
                    this.submissionToast.show('Failed to Submit Order', result.reason as string, 'error');
                }
            })
            .catch(() => {
                this.submitting(false);

            });
    }
}