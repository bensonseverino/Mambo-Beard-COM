import { getProductBySlug } from "../../lib/product.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug) {
    return new Response(
      JSON.stringify({ message: "Product slug is required." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const product = await getProductBySlug(env, slug);

    if (!product) {
      return new Response(JSON.stringify({ message: "Product not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ message: error.message || "Unable to load product." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
