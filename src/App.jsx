import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import WhatsAppButton from "./components/WhatsAppButton.jsx";
import Home from "./pages/Home.jsx";
import Shop from "./pages/Shop.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Cart from "./pages/Cart.jsx";
import Checkout from "./pages/Checkout.jsx";
import PaymentSuccess from "./pages/PaymentSuccess.jsx";
import OrderConfirmation from "./pages/OrderConfirmation.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Account from "./pages/Account.jsx";
import NotFound from "./pages/NotFound.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";
import PageTransition from "./components/PageTransition.jsx";

// PERFORMANCE: the admin pages (and the charting library behind the
// dashboard) are only ever used by the store owner, but used to be bundled
// into the file EVERY customer downloads first -- the main bundle was
// ~1.1 MB. They are now loaded on demand, only when /admin is opened.
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const AdminProducts = lazy(() => import("./pages/admin/Products.jsx"));
const AdminProductForm = lazy(() => import("./pages/admin/ProductForm.jsx"));
const AdminOrders = lazy(() => import("./pages/admin/Orders.jsx"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers.jsx"));
const AdminCategories = lazy(() => import("./pages/admin/Categories.jsx"));

function Admin({ children }) {
  return (
    <ProtectedAdminRoute>
      <Suspense fallback={null}>{children}</Suspense>
    </ProtectedAdminRoute>
  );
}

// CHECKPOINT NOTE (App.jsx):
// Route structure. Storefront routes share Navbar+Footer; admin routes use
// their own layout (see pages/admin/Dashboard.jsx) so the store owner's
// screen isn't cluttered with customer-facing chrome. There is no /ar or
// /en URL prefix yet — language is a client-side context, not a route
// param (see LanguageContext.jsx). If you want indexable /ar and /en URLs
// for SEO later, that's a deliberate follow-up change, flagged here.
export default function App() {
  return (
    <Routes>
      {/* ---------- Storefront ---------- */}
      <Route
        path="/*"
        element={
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">
              <PageTransition>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/shop" element={<Shop />} />
                  <Route path="/shop/:categorySlug" element={<Shop />} />
                  <Route path="/product/:slug" element={<ProductDetail />} />
                  <Route path="/cart" element={<Cart />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/payment-success" element={<PaymentSuccess />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/order-confirmation/:orderNumber" element={<OrderConfirmation />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </PageTransition>
            </main>
            <Footer />
            <WhatsAppButton />
          </div>
        }
      />

      {/* ---------- Admin ---------- */}
      <Route path="/admin" element={<Admin><AdminDashboard /></Admin>} />
      <Route path="/admin/products" element={<Admin><AdminProducts /></Admin>} />
      <Route path="/admin/products/new" element={<Admin><AdminProductForm /></Admin>} />
      <Route path="/admin/products/:id/edit" element={<Admin><AdminProductForm /></Admin>} />
      <Route path="/admin/orders" element={<Admin><AdminOrders /></Admin>} />
      <Route path="/admin/customers" element={<Admin><AdminCustomers /></Admin>} />
      <Route path="/admin/categories" element={<Admin><AdminCategories /></Admin>} />
    </Routes>
  );
}
