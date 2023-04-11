// This is your test secret API key.
var admin = require("firebase-admin");

var serviceAccount = require("./key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const productsRef = db.collection("Products");

const fetchProducts = async () => {
  try {
    const snapshot = await productsRef.get();
    const products = [];
    snapshot.forEach((doc) => {
      const id = doc.id;
      products.push({ id, ...doc.data() });
    });
    return products;
  } catch (error) {
    console.log(error);
  }
};

// Create a new cart document in Firestore
// const createCart = async (userId) => {
//   try {
//     const cartRef = db.collection("carts").doc(userId);
//     await cartRef.set({ items: [] });
//     console.log("Cart created successfully");
//   } catch (error) {
//     console.error("Error creating cart:", error);
//   }
// };

const createGuestCart = async () => {
  try {
    const cartRef = db.collection("carts").doc();
    const userId = cartRef.id;
    await cartRef.set({ items: [] });
    console.log("Cart created successfully with UserID:", userId);
    return userId;
  } catch (error) {
    console.error("Error creating cart:", error);
    return null;
  }
};

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY);
const app = express();
app.use(express.static("public"));
app.use(
  cors({
    origin: [
      "http://192.168.1.77:3000",
      "http://localhost:3000",
      "https://checkout.stripe.com",
    ],
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/products", async (req, res) => {
  console.log("Fetching products\n" + new Date());
  const products = await fetchProducts();
  // console.log(products[0]);
  res.json(products);
});

// app.post("/create-cart", async (req, res) => {
//   const response = await createGuestCart();

//   res.json({ message: "Cart created", userId: response });
// });

app.post("/add-to-cart", async (req, res) => {
  const { userId, id } = req.body;
  const cartRef = db.collection("carts").doc(userId);
  const cart = await cartRef.get();
  const cartData = cart.data();
  const productExists = cartData.items.find((item) => item.id === id);
  if (productExists) {
    await cartRef.update({
      items: cartData.items.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1 } : item
      ),
    });
  } else {
    await cartRef.update({
      items: [...cartData.items, { id, quantity: 1 }],
    });
  }
  res.json({ message: "Product added to cart" });
});

app.post("/remove-from-cart", async (req, res) => {
  const { userId, id } = req.body;
  console.log(userId, id);
  res.json({ message: "Product removed from cart" });
  // const cartRef = db.collection("carts").doc(userId);
  // const cart = await cartRef.get();
  // const cartData = cart.data();
  // const productExists = cartData.items.find((item) => item.id === id);

  // if (productExists) {
  //   await cartRef.update({
  //     items: cartData.items.map((item) =>
  //       item.id === id ? { ...item, quantity: item.quantity - 1 } : item
  //     ),
  //   });
  // } else {
  //   await cartRef.update({
  //     items: [...cartData.items, { id, quantity: 1 }],
  //   });
  // }
  // res.json({ message: "Product removed from cart" });
});

app.get("/get-cart", async (req, res) => {
  const { userId } = req.cookies;
  if (!userId) {
    console.log("No User found");
    const response = await createGuestCart();

    res.json({ message: "Cart created", userId: response });
  }
  const cartRef = db.collection("carts").doc(userId);
  const cart = await cartRef.get();
  const cartData = cart.data();
  const cartItems = cartData.items;
  res.json({ items: cartItems, userId: userId });
});

app.post("/create-checkout-session", async (req, res) => {
  // console.log(req.body);
  let products = [];
  await Promise.all(
    req.body.items.map(async (item) => {
      const product = await stripe.products.create({
        name: item.name,
        description: item.description,
        images: [item.url],
        shippable: true,
        tax_code: "txcd_99999999",
        url: `http://192.168.1.77:3000/${item.name.replace(/\s/g, "")}`,
      });
      // console.log(product);
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: item.price * 100,
        currency: "usd",
      });
      products.push({ price: price.id, quantity: 1 });
    })
  );

  if (products.length === 0)
    return res.json({ url: "http://192.168.1.77:3000?nocartitems=true" });

  const session = await stripe.checkout.sessions.create({
    shipping_address_collection: { allowed_countries: ["US"] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { currency: "usd", amount: 1000 },
          display_name: "Standard Shipping",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 5 },
            maximum: { unit: "business_day", value: 7 },
          },
        },
      },
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { currency: "usd", amount: 2000 },
          display_name: "Express Shipping",
          delivery_estimate: {
            minimum: { unit: "business_day", value: 2 },
            maximum: { unit: "business_day", value: 3 },
          },
        },
      },
    ],
    line_items: products,
    mode: "payment",
    success_url: "http://192.168.1.77:3000?success=true",
    cancel_url: "http://192.168.1.77:3000?canceled=true",
    automatic_tax: { enabled: true },
  });

  res.json({ url: session.url });
});

app.listen(4242, () => console.log("Running on port 4242"));
