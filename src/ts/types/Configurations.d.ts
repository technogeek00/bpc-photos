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
    airtable: {
        base: string,
        table: {
            students: {
                id: string,
                viewPrepareImages: string,
                viewComplete: string
            },
            orders: {
                id: string
            }
        }
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
