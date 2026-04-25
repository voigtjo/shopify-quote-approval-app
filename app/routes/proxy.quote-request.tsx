import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logServerError, logServerInfo } from "../lib/log.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  return new Response("Quote request endpoint is running.", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.public.appProxy(request);

    if (!session) {
      return new Response(
        JSON.stringify({ ok: false, error: "Shop session not available." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const formData = await request.formData();

    const productTitle = String(formData.get("productTitle") || "").trim();
    const productHandle = String(formData.get("productHandle") || "").trim();
    const customerName = String(formData.get("customerName") || "").trim();
    const customerEmail = String(formData.get("customerEmail") || "").trim();
    const requestText = String(formData.get("requestText") || "").trim();
    const storefrontUrl = String(formData.get("storefrontUrl") || "").trim();

    if (!productTitle || !customerEmail || !requestText) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Product, customer email, and request text are required.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const shopInstallation = await db.shopInstallation.upsert({
      where: { shopDomain: session.shop },
      update: {},
      create: {
        shopDomain: session.shop,
        appName: "Quote Approval App",
      },
    });

    const caseCount = await db.approvalCase.count({
      where: { shopInstallationId: shopInstallation.id },
    });

    const approvalCase = await db.approvalCase.create({
      data: {
        shopInstallationId: shopInstallation.id,
        externalReference: `SF-${caseCount + 1}`,
        title: `Storefront request: ${productTitle}`,
        customerName: customerName || null,
        customerEmail,
        currencyCode: "USD",
        revisions: {
          create: {
            revisionNumber: 1,
            summary: "Storefront quote request submitted by customer",
            payloadJson: JSON.stringify({
              source: "storefront",
              productTitle,
              productHandle,
              storefrontUrl,
              customerName,
              customerEmail,
              requestText,
            }),
          },
        },
        actions: {
          create: {
            actorType: "CUSTOMER",
            actionType: "CREATE_CASE",
            note: "Approval case created from storefront quote request",
          },
        },
      },
    });

    logServerInfo("Storefront quote request created case", {
      route: "proxy.quote-request",
      caseId: approvalCase.id,
      shop: session.shop,
      productTitle,
      customerEmail,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        caseId: approvalCase.id,
        message: "Your request was submitted successfully.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    logServerError("Storefront quote request failed", error, {
      route: "proxy.quote-request",
    });

    return new Response(
      JSON.stringify({
        ok: false,
        error: "The quote request could not be submitted.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};