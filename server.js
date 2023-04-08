// This is your test secret API key.

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
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
  })
);
app.use(bodyParser.json());

// const YOUR_DOMAIN = "http://localhost:4242";

app.post("/create-checkout-session", async (req, res) => {
  console.log(req.body);
  let products = [];
  await Promise.all(
    req.body.items.map(async (item) => {
      const product = await stripe.products.create({ name: item.name });
      console.log(product);
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: item.price * 100,
        currency: "usd",
      });
      products.push({ price: price.id, quantity: 1 });
    })
  );
  console.log(products);
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
