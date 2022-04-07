export const createProduct = `
mutation productCreate($input: ProductInput!) {
  productCreate(input: $input) {
    product {
      title
      id
     variants(first:50){
      edges{
        node{
          id
          sku
        }
      }
    }
    }
    userErrors {
      field
      message
    }
  }
}

`

export const createVariant = `
mutation productVariantCreate($input: ProductVariantInput!) {
  productVariantCreate(input: $input) {
    product {
     id
    }
    productVariant {
      id
      sku
    }
    userErrors {
      field
      message
    }
  }
}
`

export const createFulfillment = `
mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
  fulfillmentCreateV2(fulfillment: $fulfillment) {
    fulfillment {
      id
      status
      trackingInfo {
        company
        number
        url
      }
    }
    userErrors {
      field
      message
    }
  }
}
`
export const markOrderAsPaid = `
mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
  orderMarkAsPaid(input: $input) {
    order {
      id
    }
    userErrors {
      field
      message
    }
  }
}`
export const adjustInventoryLevelQuantity = `
mutation adjustInventoryLevelQuantity($inventoryAdjustQuantityInput: InventoryAdjustQuantityInput!) {
  inventoryAdjustQuantity(input: $inventoryAdjustQuantityInput) {
    inventoryLevel {
      available
    }
    userErrors {
      field
      message
    }
  }
}`

export const setProductVariantPrice = `
mutation productVariantUpdate($input:ProductVariantInput!){
  productVariantUpdate(input:$input){
    productVariant{
      id
      price
    }
    userErrors {
      field
      message
    }
  }
}
`
