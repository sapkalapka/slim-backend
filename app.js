// imports
import dotenv from 'dotenv/config'
import Koa from 'koa'
import KoaRouter from 'koa-router'
import KoaBody from 'koa-body'
import axios from 'axios'

// GraphQL
import { createProduct, createVariant, createFulfillment, markOrderAsPaid, adjustInventoryLevelQuantity, setProductVariantPrice } from './graphql/mutations.js'
import { queryOrder, getInventoryLevelByVariantID } from './graphql/queries.js'

// environment setup
const port = process.env.PORT
const accessToken = process.env.SHOPIFY_API_ACCESS_TOKEN
const locationId = process.env.SHOPIFY_LOCATION_ID
const shop = process.env.SHOPIFY_URL
const secret = process.env.SHOPIFY_API_SECRET

// Koa & Axios setup
const app = new Koa()
const router = new KoaRouter()
const instance = axios.create({
  baseURL: `${shop}/admin/api/2021-10/graphql.json`,
  headers: {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  },
})

// app and endpoints
app.use(KoaBody())

router.get('/', async ctx => {
  ctx.body = `Slim backend for inflyshop. Contact: gergo.jaszberenyi@gmail.com`
})

// AUTH
let auth = async ctx => {
  if (ctx.get('X-Shopify-Token') != secret) {
    console.log('Authorization failed.')
    ctx.status = 401
    ctx.body = 'Authorization failed.'
    return false
  }
  console.log('Authorization complete.')
  ctx.status = 200
  ctx.body = 'Authorization completed.'
  return true
}
// RATE LIMIT
let rateLimit = async availableRatePoints => {
  if (availableRatePoints < 50) {
    console.log(`Not enough points. Waiting a second.`)
    await new Promise(resolve => {
      setTimeout(() => {
        resolve('Waiting.')
        console.log('Done waiting. Continue.')
      }, 1000)
    })
  }
}

// CREATE PRODUCTS
router.post('/createProducts', async ctx => {
  await auth(ctx).then(async authed => {
    if (!authed) return

    let data = ctx.request.body.products
    let parallelRequests = 50
    let availableRatePoints = 0

    for (let i = 0; i < data.length; i++) {
      let product = data[i]
      let { product_id, shopify_product_id, title, description, options, published } = product.product_info
      let images = product.product_info.images.map(image => {
        if (image) {
          return {
            src: image,
          }
        }
      })
      let variants = product.variants.map(variant => {
        let { title: variantTitle, sku: variantSKU, price: variantPrice, weight: variantWeight, options: variantOption, quantity: variantQuantity } = variant
        return {
          title: variantTitle,
          sku: variantSKU,
          price: variantPrice,
          weight: parseInt(variantWeight),
          options: variantOption,
          inventoryItem: {
            tracked: true,
          },
          inventoryQuantities: {
            locationId: `gid://shopify/Location/${locationId}`,
            availableQuantity: parseInt(variantQuantity),
          },
        }
      })

      // CREATING NEW PRODUCT then SENDING SHOPIFY_ID TO XSHU
      if (!shopify_product_id) {
        if (i % parallelRequests == 0) {
          await instance
            .post('/', {
              query: createProduct,
              variables: {
                input: {
                  title: title,
                  published: false,
                  descriptionHtml: description,
                  options: options,
                  images: images,
                  variants: variants,
                },
              },
            })
            .then(res => {
              const { data, extensions, errors } = res.data
              if (errors) {
                console.log(errors)
              }
              availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
              console.log(`Rate points:${availableRatePoints}. Await`)
              console.log(`Termék létrehozva: ${data.productCreate.product.id}`)
              let variantIds = data.productCreate.product.variants.edges.map(({ node }) => {
                return {
                  sku: node.sku,
                  shopify_variant_id: node.id,
                }
              })

              axios({
                url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
                method: 'POST',
                data: {
                  shop: shop,
                  product_id: product_id,
                  shopify_product_id: data.productCreate.product.id,
                  variants: variantIds,
                },
              }).catch(err => console.log(err))
            })
            .catch(err => console.log(err))
        } else {
          instance
            .post('/', {
              query: createProduct,
              variables: {
                input: {
                  title: title,
                  published: false,
                  descriptionHtml: description,
                  options: options,
                  images: images,
                  variants: variants,
                },
              },
            })
            .then(res => {
              const { data, extensions, errors } = res.data
              if (errors) {
                console.log(errors)
              }
              availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
              console.log(`Rate point:${availableRatePoints}. Await`)
              console.log(`Termék létrehozva: ${data.productCreate.product.id}`)
              let variantIds = data.productCreate.product.variants.edges.map(({ node }) => {
                return {
                  sku: node.sku,
                  shopify_variant_id: node.id,
                }
              })

              axios({
                url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
                method: 'POST',
                data: {
                  shop: shop,
                  product_id: product_id,
                  shopify_product_id: data.productCreate.product.id,
                  variants: variantIds,
                },
              }).catch(err => console.log(err))
            })
            .catch(err => console.log(err))
        }
        rateLimit(availableRatePoints)
      } else {
        let productVariants = product.variants
        for (let j = 0; j < productVariants.length; j++) {
          let { title: variantTitle, sku: variantSKU, price: variantPrice, weight: variantWeight, options: variantOption, quantity: variantQuantity } = productVariants[j]
          if (!productVariants[j].shopify_variant_id) {
            if (j % parallelRequests == 0) {
              await instance
                .post('/', {
                  query: createVariant,
                  variables: {
                    input: {
                      productId: shopify_product_id,
                      title: variantTitle,
                      sku: variantSKU,
                      price: variantPrice,
                      weight: parseInt(variantWeight),
                      options: variantOption,
                      inventoryItem: {
                        tracked: true,
                      },
                      inventoryQuantities: {
                        locationId: `gid://shopify/Location/${locationId}`,
                        availableQuantity: parseInt(variantQuantity),
                      },
                    },
                  },
                })
                .then(res => {
                  const { data, extensions, errors } = res.data
                  console.log(JSON.stringify(res.data, null, 2))
                  if (errors) {
                    console.log(errors)
                  }
                  availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
                  console.log(`Rate points:${availableRatePoints}. Await`)
                  console.log(`Termékvariáns létrehozva: ${data.productVariantCreate.productVariant.id}`)

                  axios({
                    url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
                    method: 'POST',
                    data: {
                      shop: shop,
                      product_id: product_id,
                      shopify_product_id: data.productVariantCreate.product.id,
                      variants: [
                        {
                          sku: data.productVariantCreate.productVariant.sku,
                          shopify_variant_id: data.productVariantCreate.productVariant.id,
                        },
                      ],
                    },
                  }).catch(err => console.log(err))
                })
                .catch(err => console.log(err))
            } else {
              instance
                .post('/', {
                  query: createVariant,
                  variables: {
                    input: {
                      productId: shopify_product_id,
                      title: variantTitle,
                      sku: variantSKU,
                      price: variantPrice,
                      weight: parseInt(variantWeight),
                      options: variantOption,
                      inventoryItem: {
                        tracked: true,
                      },
                      inventoryQuantities: {
                        locationId: `gid://shopify/Location/${locationId}`,
                        availableQuantity: parseInt(variantQuantity),
                      },
                    },
                  },
                })
                .then(res => {
                  const { data, extensions, errors } = res.data
                  console.log(JSON.stringify(res.data, null, 2))
                  if (errors) {
                    console.log(errors)
                  }
                  availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
                  console.log(`Rate points:${availableRatePoints}. Await`)
                  console.log(`Termékvariáns létrehozva: ${data.productVariantCreate.productVariant.id}`)

                  axios({
                    url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
                    method: 'POST',
                    data: {
                      shop: shop,
                      product_id: product_id,
                      shopify_product_id: data.productVariantCreate.product.id,
                      variants: [
                        {
                          sku: data.productVariantCreate.productVariant.sku,
                          shopify_variant_id: data.productVariantCreate.productVariant.id,
                        },
                      ],
                    },
                  }).catch(err => console.log(err))
                })
                .catch(err => console.log(err))
            }
            rateLimit(availableRatePoints)
          }
        }
      }
    }

    // data.forEach(async (product, i) => {
    //   let { product_id, shopify_product_id, title, description, options, published } = product.product_info
    //   let images = product.product_info.images.map(image => {
    //     if (image) {
    //       return {
    //         src: image,
    //       }
    //     }
    //   })
    //   let variants = product.variants.map(variant => {
    //     let { title: variantTitle, sku: variantSKU, price: variantPrice, weight: variantWeight, options: variantOption, quantity: variantQuantity } = variant
    //     return {
    //       title: variantTitle,
    //       sku: variantSKU,
    //       price: variantPrice,
    //       weight: parseInt(variantWeight),
    //       options: variantOption,
    //       inventoryItem: {
    //         tracked: true,
    //       },
    //       inventoryQuantities: {
    //         locationId: `gid://shopify/Location/${locationId}`,
    //         availableQuantity: parseInt(variantQuantity),
    //       },
    //     }
    //   })

    //   // CREATING NEW PRODUCT then SENDING SHOPIFY_ID TO XSHU
    //   if (!shopify_product_id) {
    //     if (i % parallelRequests == 0) {
    //       await instance
    //         .post('/', {
    //           query: createProduct,
    //           variables: {
    //             input: {
    //               title: title,
    //               published: false,
    //               descriptionHtml: description,
    //               options: options,
    //               images: images,
    //               variants: variants,
    //             },
    //           },
    //         })
    //         .then(res => {
    //           const { data, extensions, errors } = res.data
    //           if (errors) {
    //             console.log(errors)
    //           }
    //           availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //           console.log(`Rate points:${availableRatePoints}. Await`)
    //           console.log(`Termék létrehozva: ${data.productCreate.product.id}`)
    //           let variantIds = data.productCreate.product.variants.edges.map(({ node }) => {
    //             return {
    //               sku: node.sku,
    //               shopify_variant_id: node.id,
    //             }
    //           })

    //           axios({
    //             url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
    //             method: 'POST',
    //             data: {
    //               shop: shop,
    //               product_id: product_id,
    //               shopify_product_id: data.productCreate.product.id,
    //               variants: variantIds,
    //             },
    //           }).catch(err => console.log(err))
    //         })
    //         .catch(err => console.log(err))
    //     } else {
    //       instance
    //         .post('/', {
    //           query: createProduct,
    //           variables: {
    //             input: {
    //               title: title,
    //               published: false,
    //               descriptionHtml: description,
    //               options: options,
    //               images: images,
    //               variants: variants,
    //             },
    //           },
    //         })
    //         .then(res => {
    //           const { data, extensions, errors } = res.data
    //           if (errors) {
    //             console.log(errors)
    //           }
    //           availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //           console.log(`Rate point:${availableRatePoints}. Await`)
    //           console.log(`Termék létrehozva: ${data.productCreate.product.id}`)
    //           let variantIds = data.productCreate.product.variants.edges.map(({ node }) => {
    //             return {
    //               sku: node.sku,
    //               shopify_variant_id: node.id,
    //             }
    //           })

    //           axios({
    //             url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
    //             method: 'POST',
    //             data: {
    //               shop: shop,
    //               product_id: product_id,
    //               shopify_product_id: data.productCreate.product.id,
    //               variants: variantIds,
    //             },
    //           }).catch(err => console.log(err))
    //         })
    //         .catch(err => console.log(err))
    //     }
    //     rateLimit(availableRatePoints)
    //   } else {
    //     product.variants.forEach(async variant => {
    //       let { title: variantTitle, sku: variantSKU, price: variantPrice, weight: variantWeight, options: variantOption, quantity: variantQuantity } = variant
    //       if (!variant.shopify_variant_id) {
    //         if (i % parallelRequests == 0) {
    //           await instance
    //             .post('/', {
    //               query: createVariant,
    //               variables: {
    //                 input: {
    //                   productId: shopify_product_id,
    //                   title: variantTitle,
    //                   sku: variantSKU,
    //                   price: variantPrice,
    //                   weight: parseInt(variantWeight),
    //                   options: variantOption,
    //                   inventoryItem: {
    //                     tracked: true,
    //                   },
    //                   inventoryQuantities: {
    //                     locationId: `gid://shopify/Location/${locationId}`,
    //                     availableQuantity: parseInt(variantQuantity),
    //                   },
    //                 },
    //               },
    //             })
    //             .then(res => {
    //               const { data, extensions, errors } = res.data
    //               console.log(JSON.stringify(res.data, null, 2))
    //               if (errors) {
    //                 console.log(errors)
    //               }
    //               availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //               console.log(`Rate points:${availableRatePoints}. Await`)
    //               console.log(`Termékvariáns létrehozva: ${data.productVariantCreate.productVariant.id}`)

    //               axios({
    //                 url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
    //                 method: 'POST',
    //                 data: {
    //                   shop: shop,
    //                   product_id: product_id,
    //                   shopify_product_id: data.productVariantCreate.product.id,
    //                   variants: [
    //                     {
    //                       sku: data.productVariantCreate.productVariant.sku,
    //                       shopify_variant_id: data.productVariantCreate.productVariant.id,
    //                     },
    //                   ],
    //                 },
    //               }).catch(err => console.log(err))
    //             })
    //             .catch(err => console.log(err))
    //         } else {
    //           instance
    //             .post('/', {
    //               query: createVariant,
    //               variables: {
    //                 input: {
    //                   productId: shopify_product_id,
    //                   title: variantTitle,
    //                   sku: variantSKU,
    //                   price: variantPrice,
    //                   weight: parseInt(variantWeight),
    //                   options: variantOption,
    //                   inventoryItem: {
    //                     tracked: true,
    //                   },
    //                   inventoryQuantities: {
    //                     locationId: `gid://shopify/Location/${locationId}`,
    //                     availableQuantity: parseInt(variantQuantity),
    //                   },
    //                 },
    //               },
    //             })
    //             .then(res => {
    //               const { data, extensions, errors } = res.data
    //               if (errors) {
    //                 console.log(errors)
    //               }
    //               availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //               console.log(`Rate points:${availableRatePoints}.`)
    //               console.log(`Termékvariáns létrehozva: ${data.productVariantCreate.productVariant.id}`)

    //               axios({
    //                 url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/set_product_id&cron=true',
    //                 method: 'POST',
    //                 data: {
    //                   shop: shop,
    //                   product_id: product_id,
    //                   shopify_product_id: data.productVariantCreate.product.id,
    //                   variants: [
    //                     {
    //                       sku: data.productVariantCreate.productVariant.sku,
    //                       shopify_variant_id: data.productVariantCreate.productVariant.id,
    //                     },
    //                   ],
    //                 },
    //               }).catch(err => console.log(err))
    //             })
    //             .catch(err => console.log(err))
    //         }
    //         rateLimit(availableRatePoints)
    //       }
    //     })
    //   }
    // })
  })
  //router.post vége
})
// VARIANT DELETE
router.post('/productUpdate', async ctx => {
  ctx.status = 200
  ctx.body = 'Successful update - response'
  let data = ctx.request.body.variants

  let variants = data.map(({ sku, id }) => {
    return {
      sku: sku,
      shopify_variant_id: id,
    }
  })
  axios({
    url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/product_update&cron=true',
    method: 'POST',
    data: {
      shop: shop,
      shopify_product_id: ctx.request.body.id,
      variants,
    },
  })
})
// PRODUCT DELETE
router.post('/productDelete', async ctx => {
  ctx.status = 200
  ctx.body = 'Successful deletion - response'
  let data = ctx.request.body
  console.log(`Deleted: ${data.id} product.`)
  axios({
    url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/product/product_delete&cron=true',
    method: 'POST',
    data: {
      shop: shop,
      shopify_product_id: data.id,
    },
  })
})
// SYNC INVENTORY
router.post('/syncInventory', async ctx => {
  await auth(ctx).then(async authed => {
    if (!authed) return

    let inventoryUpdate = ctx.request.body

    let parallelRequests = 10
    let availableRatePoints = 0

    for (let i = 0; i < inventoryUpdate.length; i++) {
      let product = inventoryUpdate[i]
      if (i % parallelRequests == 0) {
        await instance
          .post('/', {
            query: getInventoryLevelByVariantID,
            variables: {
              id: product.shopify_variant_id,
            },
          })
          .then(res => {
            const { data, extensions, errors } = res.data
            if (errors) {
              console.log(errors)
            }
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable

            let diff = data.productVariant.inventoryQuantity - product.quantity
            if (diff < 0) {
              diff = Math.abs(diff)
            } else if (diff > 0) {
              diff = Math.abs(diff) * -1
            }

            instance
              .post('/', {
                query: adjustInventoryLevelQuantity,
                variables: {
                  inventoryAdjustQuantityInput: {
                    inventoryLevelId: data.productVariant.inventoryItem.inventoryLevel.id,
                    availableDelta: diff,
                  },
                },
              })
              .then(res => {
                const { data, extensions, errors } = res.data
                availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
                console.log(`Rate points ${availableRatePoints}. Await`)
              })
              .catch(e => console.error(e))
          })
          .catch(e => console.error(e))
      } else {
        instance
          .post('/', {
            query: getInventoryLevelByVariantID,
            variables: {
              id: product.shopify_variant_id,
            },
          })
          .then(res => {
            const { data, extensions, errors } = res.data
            if (errors) {
              console.log(errors)
            }
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable

            let diff = data.productVariant.inventoryQuantity - product.quantity
            if (diff < 0) {
              diff = Math.abs(diff)
            } else if (diff > 0) {
              diff = Math.abs(diff) * -1
            }

            instance
              .post('/', {
                query: adjustInventoryLevelQuantity,
                variables: {
                  inventoryAdjustQuantityInput: {
                    inventoryLevelId: data.productVariant.inventoryItem.inventoryLevel.id,
                    availableDelta: diff,
                  },
                },
              })
              .then(res => {
                const { data, extensions, errors } = res.data
                availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
                console.log(`Rate points ${availableRatePoints}.`)
              })
              .catch(e => console.error(e))
          })
          .catch(e => console.error(e))
      }
      rateLimit(availableRatePoints)
    }

    // inventoryUpdate.forEach(async (product, i) => {
    //   if (i % parallelRequests == 0) {
    //     await instance
    //       .post('/', {
    //         query: getInventoryLevelByVariantID,
    //         variables: {
    //           id: product.shopify_variant_id,
    //         },
    //       })
    //       .then(res => {
    //         const { data, extensions, errors } = res.data
    //         if (errors) {
    //           console.log(errors)
    //         }
    //         availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable

    //         let diff = data.productVariant.inventoryQuantity - product.quantity
    //         if (diff < 0) {
    //           diff = Math.abs(diff)
    //         } else if (diff > 0) {
    //           diff = Math.abs(diff) * -1
    //         }

    //         instance
    //           .post('/', {
    //             query: adjustInventoryLevelQuantity,
    //             variables: {
    //               inventoryAdjustQuantityInput: {
    //                 inventoryLevelId: data.productVariant.inventoryItem.inventoryLevel.id,
    //                 availableDelta: diff,
    //               },
    //             },
    //           })
    //           .then(res => {
    //             const { data, extensions, errors } = res.data
    //             availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //             console.log(`Rate points ${availableRatePoints}. Await`)
    //           })
    //           .catch(e => console.error(e))
    //       })
    //       .catch(e => console.error(e))
    //   } else {
    //     instance
    //       .post('/', {
    //         query: getInventoryLevelByVariantID,
    //         variables: {
    //           id: product.shopify_variant_id,
    //         },
    //       })
    //       .then(res => {
    //         const { data, extensions, errors } = res.data
    //         if (errors) {
    //           console.log(errors)
    //         }
    //         availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable

    //         let diff = data.productVariant.inventoryQuantity - product.quantity
    //         if (diff < 0) {
    //           diff = Math.abs(diff)
    //         } else if (diff > 0) {
    //           diff = Math.abs(diff) * -1
    //         }

    //         instance
    //           .post('/', {
    //             query: adjustInventoryLevelQuantity,
    //             variables: {
    //               inventoryAdjustQuantityInput: {
    //                 inventoryLevelId: data.productVariant.inventoryItem.inventoryLevel.id,
    //                 availableDelta: diff,
    //               },
    //             },
    //           })
    //           .then(res => {
    //             const { data, extensions, errors } = res.data
    //             availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //             console.log(`Rate points ${availableRatePoints}.`)
    //           })
    //           .catch(e => console.error(e))
    //       })
    //       .catch(e => console.error(e))
    //   }
    //   rateLimit(availableRatePoints)
    // })
  })
})
// SYNC PRICES
router.post('/syncPrice', async ctx => {
  await auth(ctx).then(async authed => {
    if (!authed) return

    let priceUpdate = ctx.request.body
    let parallelRequests = 10
    let availableRatePoints = 0

    for (let i = 0; i < priceUpdate.length; i++) {
      let product = priceUpdate[i]
      if (i % parallelRequests == 0) {
        await instance
          .post('/', {
            query: setProductVariantPrice,
            variables: {
              id: product.shopify_variant_id,
              price: price,
            },
          })
          .then(res => {
            const { data, extensions, errors } = res.data
            if (errors) console.log(errors)
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
            console.log(`Rate points: ${availableRatePoints}.`)
            console.log(`${data.productVariantUpdate.productVariant.id} frissítve ${data.productVariantUpdate.productVariant.price}-ra/re.`)
          })
          .catch(e => {
            console.log(e)
          })
      } else {
        instance
          .post('/', {
            query: setProductVariantPrice,
            variables: {
              id: product.shopify_variant_id,
              price: price,
            },
          })
          .then(res => {
            const { data, extensions, errors } = res.data
            if (errors) console.log(errors)
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
            console.log(`Rate points: ${availableRatePoints}. Await`)
            console.log(`${data.productVariantUpdate.productVariant.id} frissítve ${data.productVariantUpdate.productVariant.price}-ra/re.`)
          })
          .catch(e => {
            console.log(e)
          })
      }
      rateLimit(availableRatePoints)
    }

    // priceUpdate.forEach(async (product, i) => {
    //   if (i % parallelRequests == 0) {
    //     await instance
    //       .post('/', {
    //         query: setProductVariantPrice,
    //         variables: {
    //           id: product.shopify_variant_id,
    //           price: price,
    //         },
    //       })
    //       .then(res => {
    //         const { data, extensions, errors } = res.data
    //         if (errors) console.log(errors)
    //         availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //         console.log(`Rate points: ${availableRatePoints}.`)
    //         console.log(`${data.productVariantUpdate.productVariant.id} frissítve ${data.productVariantUpdate.productVariant.price}-ra/re.`)
    //       })
    //       .catch(e => {
    //         console.log(e)
    //       })
    //   } else {
    //     instance
    //       .post('/', {
    //         query: setProductVariantPrice,
    //         variables: {
    //           id: product.shopify_variant_id,
    //           price: price,
    //         },
    //       })
    //       .then(res => {
    //         const { data, extensions, errors } = res.data
    //         if (errors) console.log(errors)
    //         availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
    //         console.log(`Rate points: ${availableRatePoints}. Await`)
    //         console.log(`${data.productVariantUpdate.productVariant.id} frissítve ${data.productVariantUpdate.productVariant.price}-ra/re.`)
    //       })
    //       .catch(e => {
    //         console.log(e)
    //       })
    //   }
    //   rateLimit(availableRatePoints)
    // })
  })
})
// CREATE FULFILLMENTORDER FROM ORDER ID AND COMPLETE ORDER
router.post('/setFulfillment', async ctx => {
  await auth(ctx).then(async authed => {
    if (!authed) return
    // successfully authed
    let parallelRequests = 20
    let availableRatePoints = 0

    let data = ctx.request.body

    for (let i = 0; i < data.length; i++) {
      let order = data[i]
      let { shopify_order_id, order_id, tracking_company, tracking_number, tracking_url } = order
      if (i % parallelRequests == 0) {
        await instance
          .post('/', {
            query: queryOrder,
            variables: {
              id: `gid://shopify/Order/${shopify_order_id}`,
            },
          })
          .then(res => {
            let { data, extensions, errors } = res.data
            if (errors) console.log(errors)
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
            console.log(`Rate points: ${availableRatePoints} await`)
            instance
              .post('/', {
                query: createFulfillment,
                variables: {
                  fulfillment: {
                    notifyCustomer: true,
                    trackingInfo: {
                      number: tracking_number,
                      url: tracking_url,
                      company: tracking_company,
                    },
                    lineItemsByFulfillmentOrder: [
                      {
                        fulfillmentOrderId: data.order.fulfillmentOrders.edges[0].node.id,
                      },
                    ],
                  },
                },
              })
              .then(({ data, errors, extensions }) => {
                console.log(data.data.fulfillmentCreateV2.userErrors)
                if (errors) console.log(errors)
                availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
              })
              .catch(e => console.log(e))
          })
      } else {
        instance
          .post('/', {
            query: queryOrder,
            variables: {
              id: `gid://shopify/Order/${shopify_order_id}`,
            },
          })
          .then(res => {
            let { data, extensions, errors } = res.data
            if (errors) console.log(errors)
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
            console.log(`Rate points: ${availableRatePoints} `)
            console.log(data.order.fulfillmentOrders.edges[0])
            instance
              .post('/', {
                query: createFulfillment,
                variables: {
                  fulfillment: {
                    notifyCustomer: true,
                    trackingInfo: {
                      number: tracking_number,
                      url: tracking_url,
                      company: tracking_company,
                    },
                    lineItemsByFulfillmentOrder: [
                      {
                        fulfillmentOrderId: data.order.fulfillmentOrders.edges[0].node.id,
                      },
                    ],
                  },
                },
              })
              .then(({ data, errors, extensions }) => {
                console.log(data.data.fulfillmentCreateV2.userErrors)
                if (errors) console.log(errors)
                availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
              })
              .catch(e => console.log(e))
          })
      }
      rateLimit(availableRatePoints)
    }
  })
})
//
router.post('/setPaid', async ctx => {
  await auth(ctx).then(async authed => {
    if (!authed) return
    // successfully authed
    let parallelRequests = 20
    let availableRatePoints = 0

    let data = ctx.request.body
    for (let i = 0; i < data.length; i++) {
      let order = data[i]
      let { shopify_order_id } = order
      if (i % parallelRequests == 0) {
        await instance
          .post('/', {
            query: markOrderAsPaid,
            variables: {
              input: {
                id: `gid://shopify/Order/${shopify_order_id}`,
              },
            },
          })
          .then(res => {
            let { data, errors, extensions } = res.data
            if (errors) console.log(errors)
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
            console.log(`Rate points: ${availableRatePoints} await`)
            console.log(`Order marked as paid: ${data.orderMarkAsPaid.order.id}`)
          })
          .catch(e => console.log(e))
      } else {
        instance
          .post('/', {
            query: markOrderAsPaid,
            variables: {
              input: {
                id: `gid://shopify/Order/${shopify_order_id}`,
              },
            },
          })
          .then(res => {
            let { data, errors, extensions } = res.data
            if (errors) console.log(errors)
            availableRatePoints = extensions?.cost.throttleStatus.currentlyAvailable
            console.log(`Rate points: ${availableRatePoints}`)
            console.log(`Order marked as paid: ${data.orderMarkAsPaid.order.id}`)
          })
          .catch(e => console.log(e))
      }
      rateLimit(availableRatePoints)
    }
  })
})
//order creation
router.post('/orderCreation', async ctx => {
  ctx.status = 200
  ctx.body = 'Successful payment - response'
  const data = ctx.request.body

  console.log(data)
  axios({
    url: 'https://traderheavens.com/v3_foadmin/index.php?route=shopify/order&cron=true',
    method: 'POST',
    data: {
      data,
    },
  })
})

app.use(router.routes()).use(router.allowedMethods())
app.listen(port, () => console.log(`Server running at port: ${port}`))
