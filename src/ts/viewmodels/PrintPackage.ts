export default class PrintPackage {
    name: string;
    type: string;
    description: string;
    price: number;
    max: number;

    constructor(name: string, type: string, description: string = "", price: number, max: number) {
        this.name = name;
        this.type = type;
        this.description = description;
        this.price = price;
        this.max = max;
    }
}
