import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logServerError, logServerInfo } from "../lib/log.server";

function buildRedirectUrl(
  shopDomain: string,
  storefrontUrl: string,
  status: "success" | "error",
  options?: { caseId?: string; message?: string },
) {
  let safeUrl: URL;

  try {
    const parsed = new URL(storefrontUrl);
    if (parsed.hostname !== shopDomain) {
      safeUrl = new URL(`https://${shopDomain}`);
    } else {
      safeUrl = parsed;
    }
  } catch {
    safeUrl = new URL(`https://${shopDomain}`);
  }

  safeUrl.searchParams.set("quoteRequest", status);

  if (options?.caseId) {
    safeUrl.searchParams.set("caseId", options.caseId);
  }

  if (options?.message) {
    safeUrl.searchParams.set("message", options.message);
  }

  safeUrl.hash = "quote-request";

  return safeUrl.toString();
}

function redirectResponse(url: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  return new Response("Quote request endpoint is running.", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let storefrontUrl = "";
  let productTitle = "";
  let customerEmail = "";

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

    storefrontUrl = String(formData.get("storefrontUrl") || "").trim();
    productTitle = String(formData.get("productTitle") || "").trim();
    const productHandle = String(formData.get("productHandle") || "").trim();
    const customerName = String(formData.get("customerName") || "").trim();
    customerEmail = String(formData.get("customerEmail") || "").trim();
    const requestText = String(formData.get("requestText") || "").trim();

    if (!productTitle || !customerEmail || !requestText) {
      return redirectResponse(
        buildRedirectUrl(session.shop, storefrontUrl, "error", {
          message: "Bitte Produkt, E-Mail und Anforderung ausfüllen.",
        }),
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

    return redirectResponse(
      buildRedirectUrl(session.shop, storefrontUrl, "success", {
        caseId: approvalCase.id,
        message: "Ihre Anfrage wurde erfolgreich gesendet.",
      }),
    );
  } catch (error) {
    logServerError("Storefront quote request failed", error, {
      route: "proxy.quote-request",
      storefrontUrl,
      productTitle,
      customerEmail,
    });

    const shopDomain =
      request.headers.get("x-shopify-shop-domain") ||
      request.headers.get("shopify-shop-domain") ||
      "";

    if (storefrontUrl && shopDomain) {
      return redirectResponse(
        buildRedirectUrl(shopDomain, storefrontUrl, "error", {
          message: "Die Anfrage konnte nicht gesendet werden.",
        }),
      );
    }

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