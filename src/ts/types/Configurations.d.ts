// shared data types
declare interface OrderablePackageConfiguration {
    name: string,
    type: "collection" | "a-la-carte",
    description?: string,
    price: number,
    maximum: number
}

// datasources.json objects
declare interface DatasourcesConfig {
    googlesheet: {
        id: string,
        ranges: {
            information: string,
            submissions: string
        },
        auth: any // note we any here as the google auth config is opaque
    },
    images: {
        directory: string
    }
}

// presentation.json objects
declare interface PresentationConfig {
    name: string,
    icon: string,
    text: {
        [k: string]: string | string[]
    },
    packages: OrderablePackageConfiguration[]
}
