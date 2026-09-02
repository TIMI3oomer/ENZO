import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import WhatsAppButton from "./components/WhatsAppButton.jsx";
import Home from "./pages/Home.jsx";
import Shop from "./pages/Shop.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Cart from "./pages/Cart.jsx";
import Checkout from "./pages/Checkout.jsx";
import OrderConfirmation from "./pages/OrderConfirmation.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Account from "./pages/Account.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import AdminProducts from "./pages/admin/Products.jsx";
import AdminProductForm from "./pages/admin/ProductForm.jsx";
import AdminOrders from "./pages/admin/Orders.jsx";
import AdminCustomers from "./pages/admin/Customers.jsx";
import AdminCategories from "./pages/admin/Categories.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";
import PageTransition from "./components/PageTransition.jsx";

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
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/account" element={<Account />} />
                  <Route path="/order-confirmation/:orderNumber" element={<OrderConfirmation />} />
                </Routes>
              </PageTransition>
            </main>
            <Footer />
            <WhatsAppButton />
          </div>
        }
      />

      {/* ---------- Admin ---------- */}
      <Route
        path="/admin"
        element={
          <ProtectedAdminRoute>
            <AdminDashboard />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/products"
        element={
          <ProtectedAdminRoute>
            <AdminProducts />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/products/new"
        element={
          <ProtectedAdminRoute>
            <AdminProductForm />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/products/:id/edit"
        element={
          <ProtectedAdminRoute>
            <AdminProductForm />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/orders"
        element={
          <ProtectedAdminRoute>
            <AdminOrders />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/customers"
        element={
          <ProtectedAdminRoute>
            <AdminCustomers />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <ProtectedAdminRoute>
            <AdminCategories />
          </ProtectedAdminRoute>
        }
      />
    </Routes>
  );
}
