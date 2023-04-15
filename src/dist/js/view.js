class Image {
    constructor(name, path) {
        this.name = name;
        this.path = path;
    }

    get filename() {
        return this.name;
    }

    get jpeg() {
        return `${this.path}${this.name}.jpg`;
    }

    get thumb() {
        return `${this.path}${this.name}-thumb.jpg`;
    }

    get raw() {
        return `${this.path}${this.name}.CR3`;
    }
}

class PrintPackage {
    constructor(name, price, max) {
        this.name = name;
        this.price = price;
        this.max = max;
    }
}

class Action {
    constructor(click, enabled = true) {
        this.click = click;
        this.enabled = enabled;
    }
}

class OrderLineItem {
    constructor(details) {
        this.details = details;
        this.price = `$${details.price}`;
        this.quantity = qd.observable(0);
        this.total = qd.computed(() => {
            let total = Math.floor(this.details.price * this.quantity() * 100) / 100;
            return `$${total}`;
        }, this, [this.quantity]);

        this.increase = new Action(() => {
            this.quantity(Math.min(this.details.max, this.quantity() + 1));
        }, qd.computed(() => this.quantity() < this.details.max, this, [this.quantity]));

        this.decrease = new Action(() => {
            this.quantity(Math.max(0, this.quantity() - 1))
        }, qd.computed(() => this.quantity() > 0, this, [this.quantity]));
    }

    reset() {
        this.quantity(0);
    }
}

class OrderableImage {
    constructor(image, packages, parent) {
        this.image = image;
        this.parent = parent;
        this.packages = qd.observableArray(packages.map((detail) => new OrderLineItem(detail))),
        this.actions = {
            preview: new Action(() => this.preview()),
            order: new Action(() => this.order(), qd.observable(true)),
            remove: new Action(() => this.remove())
        }
    }

    preview() {
        this.parent.showPreview(this);
    }

    order() {
        this.actions.order.enabled(false);
        this.parent.addItem(this);
    }

    remove() {
        this.parent.removeItem(this);
        this.packages().forEach((item) => item.reset());
        this.actions.order.enabled(true);
    }
}

class Preview {
    constructor() {
        this.visible = qd.observable(false);
        this.name = qd.observable('');
        this.source = qd.observable('');
    }

    show(image) {
        this.name(image.filename);
        this.source(image.jpeg);
        this.visible(true);
        console.log(`Show ${image.name}`)
    }

    clear() {
        this.source('');
        this.visible(false);
    }
}

class Order {
    constructor(images, packages) {
        this.packages = packages;
        this.images = images.map((image) => new OrderableImage(image, packages, this));
        this.order = qd.observableArray();
        this.orderHasItems = qd.computed(() => {
            return this.order().length > 0;
        }, this, [this.order]);
        this.preview = new Preview();
    }

    addItem(image) {
        this.order.push(image);
    }

    removeItem(image) {
        this.order.remove(image);
    }

    showPreview(image) {
        this.preview.show(image);
    }
}

const PACKAGES = [
    new PrintPackage('Collection 1', 2.86, 1),
    new PrintPackage('Collection 2', 0.97, 1),
    new PrintPackage('Collection 3', 0.29, 1),
    new PrintPackage('4x6', 0.11, 5),
    new PrintPackage('5x7', 0.17, 5),
    new PrintPackage('8x10', 0.41, 5),
    new PrintPackage('Wallets (4)', 0.11, 5)
];

const IMAGES = [
    'IMG_1490',
    'IMG_1491',
    'IMG_1492',
    'IMG_1493',
    'IMG_1494',
    'IMG_1495',
    'IMG_1497',
    'IMG_1499'
].map((str) => new Image(str, 'static/subjects/twos-molly/'));

let ORDER = new Order(IMAGES, PACKAGES);

window.onload = function() {
    qd.bindModel(ORDER, document.body);
};