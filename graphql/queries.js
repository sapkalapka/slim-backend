import dotenv from 'dotenv/config'
const locationId = process.env.SHOPIFY_LOCATION_ID

export const queryOrder = `
query getOrder($id:ID!){
  order(id: $id) {
    fulfillmentOrders(first:1){
      edges{
        node{
          id
        }
      }
    }
  }
}
`

export const getInventoryLevelByVariantID = `
query getData($id:ID!){
  productVariant(id:$id){
    inventoryQuantity
    inventoryItem{
      id
        inventoryLevel(locationId:gid://shopify/Location/${locationId}"){
          id
        }
      }
    userErrors {
      field
      message
    }
  }
}
`
