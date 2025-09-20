# Order Management Dashboard

## Overview

This is a comprehensive order management dashboard application built with Node.js and Express, designed to manage orders, stocktaking, and funds for an educational institution or organization. The system integrates with Notion as its primary database backend and provides a complete workflow for order management including creation, tracking, assignment, and reporting. The application features user authentication, multiple user roles with different page access permissions, and PDF generation capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js server with session-based authentication
- **Authentication**: Express sessions with username/password validation against Notion database
- **Authorization**: Role-based access control where users have specific allowed pages stored in their Notion profile
- **API Design**: RESTful endpoints for CRUD operations on orders, components, team members, and funds
- **File Generation**: PDF creation using PDFKit for order reports and documentation

### Frontend Architecture
- **Structure**: Multi-page application with server-side routing
- **UI Framework**: Vanilla JavaScript with modern CSS using CSS custom properties
- **Component Library**: Feather Icons for consistent iconography
- **Enhanced Inputs**: Choices.js for improved select dropdowns with search functionality
- **Responsive Design**: Mobile-first approach with collapsible sidebar navigation
- **State Management**: Client-side caching using localStorage and sessionStorage for user preferences and data

### Data Architecture
- **Primary Storage**: Notion databases serving as the main data layer
- **Database Structure**: 
  - Products/Components database for inventory items
  - Orders database for current and historical orders
  - Team Members database for user management and authentication
  - Stocktaking database for inventory tracking
  - Funds database for expense management
- **Data Flow**: Orders follow a workflow from creation → request → assignment → completion
- **Grouping Logic**: Orders are grouped by reason and creation time for better organization

### Authentication & Authorization
- **Session Management**: Express sessions with configurable secrets
- **User Profiles**: Stored in Notion with username, password, department, position, and allowed pages
- **Access Control**: Page-level permissions based on user's allowed pages array
- **Security**: Password masking in UI and secure session handling

### Key Features
- **Order Management**: Complete lifecycle from creation to completion with multi-step wizard
- **School Request System**: Special workflow for handling school-requested orders with assignment capabilities
- **Stocktaking**: Inventory management with tag-based categorization and quantity tracking
- **Funds Management**: Expense tracking for missions and operations
- **Dashboard Analytics**: Statistics and metrics for order status and completion rates
- **PDF Export**: Generate reports and documentation for orders
- **Search & Filtering**: Real-time search across all major data entities

## External Dependencies

### Core Dependencies
- **@notionhq/client**: Official Notion API client for database operations
- **express**: Web application framework for Node.js
- **express-session**: Session middleware for user authentication
- **pdfkit**: PDF generation library for creating reports and documents

### Frontend Libraries
- **Feather Icons**: Icon library for consistent UI iconography
- **Choices.js**: Enhanced select dropdowns with search and filtering capabilities

### Notion Integration
- **Database Configuration**: Five main Notion databases (Products, Orders, Team Members, Stocktaking, Funds)
- **API Key Management**: Secure API key storage using environment variables
- **Real-time Sync**: Direct API calls to Notion for live data updates
- **Schema Flexibility**: Adaptable to Notion database schema changes

### Environment Configuration
- **Replit Secrets**: Secure storage for Notion API keys and database IDs
- **Session Security**: Configurable session secrets for production deployment
- **Port Configuration**: Dynamic port assignment for cloud deployment platforms