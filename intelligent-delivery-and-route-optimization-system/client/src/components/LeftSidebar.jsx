import React from 'react';
import { FiArchive, FiPackage, FiClock } from 'react-icons/fi';

export default function LeftSidebar({ activeTab, onTabChange }) {
  return (
    <aside className="left-sidebar">
      <div className="sidebar-brand">
        <div className="brand-badge">IDROS</div>
        <div className="brand-text">Intelligent Delivery and Route Optimization System</div>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={`nav-item ${activeTab === 'storehouses' ? 'active' : ''}`}
          onClick={() => onTabChange('storehouses')}
          title="Storehouses"
        >
          <FiArchive className="nav-icon" />
          <span className="nav-label">Storehouses</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => onTabChange('orders')}
          title="Orders"
        >
          <FiPackage className="nav-icon" />
          <span className="nav-label">Orders</span>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'order_history' ? 'active' : ''}`}
          onClick={() => onTabChange('order_history')}
          title="Order History"
        >
          <FiClock className="nav-icon" />
          <span className="nav-label">Order History</span>
        </button>
      </nav>
    </aside>
  );
}
