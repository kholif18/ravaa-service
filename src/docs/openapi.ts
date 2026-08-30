import type { OpenAPI } from "openapi-types";

export const openapiDoc: OpenAPI.Document = {
  openapi: "3.0.3",
  info: {
    title: "Ravaa Service API",
    version: "1.0.0",
    description:
      "Central Account and Identity API for the Ravaa ecosystem.\n\nProvides authentication, user management, session management, application registry, and audit logging for all Ravaa applications.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Development server",
    },
  ],
  tags: [
    { name: "Health", description: "Health check endpoints" },
    { name: "Authentication", description: "Register, login, logout, refresh" },
    { name: "Users", description: "User profile management" },
    { name: "Sessions", description: "Session management" },
    { name: "Applications", description: "Application registry management (Admin only)" },
    { name: "Permissions", description: "Permission and authorization management (Admin only)" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token obtained from login or register",
      },
    },
    schemas: {
      // ─── Error Schemas ────────────────────────────────────────
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "INTERNAL_SERVER_ERROR" },
              message: { type: "string", example: "Internal server error" },
            },
          },
        },
      },
      ValidationErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message", "details"],
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "Validation failed" },
              details: {
                type: "object",
                additionalProperties: {
                  type: "array",
                  items: { type: "string" },
                },
                example: { email: ["Invalid email"] },
              },
            },
          },
        },
      },
      UnauthorizedResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "AUTHENTICATION_ERROR" },
              message: { type: "string", example: "Invalid credentials" },
            },
          },
        },
      },
      ForbiddenResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "AUTHORIZATION_ERROR" },
              message: { type: "string", example: "Administrator privileges required" },
            },
          },
        },
      },
      ConflictResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "CONFLICT" },
              message: { type: "string", example: "Email already registered" },
            },
          },
        },
      },
      RateLimitResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "RATE_LIMIT" },
              message: { type: "string", example: "Too many requests" },
            },
          },
        },
      },
      AccountLockedResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "ACCOUNT_LOCKED" },
              message: {
                type: "string",
                example: "Account is temporarily locked. Please try again later.",
              },
            },
          },
        },
      },

      // ─── Common Schemas ───────────────────────────────────────
      SafeUser: {
        type: "object",
        required: ["id", "email", "username", "role", "status", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid", example: "550e8400-e29b-41d4-a716-446655440000" },
          email: { type: "string", format: "email", example: "user@example.com" },
          username: { type: "string", example: "demo_user" },
          displayName: { type: "string", nullable: true, example: "Demo User" },
          avatarUrl: { type: "string", nullable: true },
          role: { type: "string", enum: ["USER", "ADMIN"], example: "USER" },
          status: { type: "string", enum: ["active", "suspended", "pending"], example: "pending" },
          emailVerifiedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SessionInfo: {
        type: "object",
        required: ["id", "expiresAt", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          deviceName: { type: "string", nullable: true, example: "My Laptop" },
          deviceType: { type: "string", nullable: true, example: "web" },
          ipAddress: { type: "string", nullable: true, example: "192.168.1.1" },
          lastActiveAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          revokedAt: { type: "string", format: "date-time", nullable: true },
        },
      },

      // ─── Application Schemas ──────────────────────────────────
      SafeApplication: {
        type: "object",
        required: ["id", "name", "slug", "clientId", "status", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", example: "Ravaa Drive" },
          slug: { type: "string", example: "ravaa-drive" },
          clientId: { type: "string", example: "ravaa_drive_a1b2c3d4e5f6..." },
          redirectUris: { type: "array", items: { type: "string" }, example: [] },
          status: { type: "string", enum: ["active", "inactive", "suspended", "disabled"], example: "active" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ApplicationScope: {
        type: "object",
        required: ["id", "applicationId", "scope", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          applicationId: { type: "string", format: "uuid" },
          scope: { type: "string", example: "drive:read" },
          description: { type: "string", nullable: true, example: "Read access to Drive files" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      UserApplicationAccess: {
        type: "object",
        required: ["id", "userId", "applicationId", "scopes", "grantedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          applicationId: { type: "string", format: "uuid" },
          scopes: { type: "array", items: { type: "string" }, example: ["drive:read", "drive:write"] },
          grantedAt: { type: "string", format: "date-time" },
          revokedAt: { type: "string", format: "date-time", nullable: true },
        },
      },

      // ─── Request Schemas ──────────────────────────────────────
      RegisterRequest: {
        type: "object",
        required: ["email", "username", "password"],
        properties: {
          email: { type: "string", format: "email", example: "user@example.com" },
          username: {
            type: "string",
            minLength: 3,
            maxLength: 50,
            pattern: "^[a-z0-9_]+$",
            example: "demo_user",
          },
          password: { type: "string", minLength: 8, example: "password123" },
          displayName: { type: "string", maxLength: 100, example: "Demo User" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["identifier", "password"],
        properties: {
          identifier: {
            type: "string",
            description: "Email or username",
            example: "user@example.com",
          },
          password: { type: "string", example: "password123" },
          deviceName: { type: "string", example: "My Laptop" },
          deviceType: { type: "string", enum: ["web", "mobile", "desktop", "api"], example: "web" },
        },
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string", description: "Refresh token from login/register" },
        },
      },
      CreateApplicationRequest: {
        type: "object",
        required: ["name", "slug"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100, example: "Ravaa Drive" },
          slug: {
            type: "string",
            minLength: 3,
            maxLength: 50,
            pattern: "^[a-z0-9-]+$",
            example: "ravaa-drive",
          },
          redirectUris: { type: "array", items: { type: "string", format: "uri" }, example: [] },
        },
      },
      UpdateApplicationRequest: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100, example: "Ravaa Drive" },
          redirectUris: { type: "array", items: { type: "string", format: "uri" } },
          status: { type: "string", enum: ["active", "inactive", "suspended", "disabled"] },
        },
      },
      CreateScopeRequest: {
        type: "object",
        required: ["scope"],
        properties: {
          scope: { type: "string", example: "drive:read" },
          description: { type: "string", example: "Read access to Drive files" },
        },
      },
      GrantAccessRequest: {
        type: "object",
        required: ["userId", "scopes"],
        properties: {
          userId: { type: "string", format: "uuid" },
          scopes: { type: "array", items: { type: "string" }, minItems: 1, example: ["drive:read"] },
        },
      },

      // ─── Response Schemas ─────────────────────────────────────
      AuthResult: {
        type: "object",
        required: ["user", "accessToken", "refreshToken", "expiresIn"],
        properties: {
          user: { $ref: "#/components/schemas/SafeUser" },
          accessToken: { type: "string", description: "JWT access token (15 min TTL)" },
          refreshToken: { type: "string", description: "Refresh token (7 day TTL)" },
          expiresIn: { type: "number", example: 900 },
        },
      },
      RefreshResult: {
        type: "object",
        required: ["accessToken", "refreshToken", "expiresIn"],
        properties: {
          accessToken: { type: "string", description: "New JWT access token" },
          refreshToken: { type: "string", description: "New refresh token (old token revoked)" },
          expiresIn: { type: "number", example: 900 },
        },
      },
      SessionsResponse: {
        type: "object",
        required: ["sessions"],
        properties: {
          sessions: {
            type: "array",
            items: { $ref: "#/components/schemas/SessionInfo" },
          },
        },
      },
      MessageResponse: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", example: "Logged out" },
        },
      },
      ApplicationWithSecret: {
        type: "object",
        required: ["application", "clientSecret"],
        properties: {
          application: { $ref: "#/components/schemas/SafeApplication" },
          clientSecret: {
            type: "string",
            description: "Client secret (ONE TIME ONLY - save this value, it cannot be retrieved later)",
          },
        },
      },
      ApplicationsResponse: {
        type: "object",
        required: ["applications"],
        properties: {
          applications: {
            type: "array",
            items: { $ref: "#/components/schemas/SafeApplication" },
          },
        },
      },
      ScopesResponse: {
        type: "object",
        required: ["scopes"],
        properties: {
          scopes: {
            type: "array",
            items: { $ref: "#/components/schemas/ApplicationScope" },
          },
        },
      },
      AccessResponse: {
        type: "object",
        required: ["access"],
        properties: {
          access: {
            type: "array",
            items: { $ref: "#/components/schemas/UserApplicationAccess" },
          },
        },
      },
      ClientSecretResponse: {
        type: "object",
        required: ["clientSecret"],
        properties: {
          clientSecret: {
            type: "string",
            description: "New client secret (ONE TIME ONLY - save this value)",
          },
        },
      },

      // ─── Permission Schemas ─────────────────────────────────────
      SafePermission: {
        type: "object",
        required: ["id", "resource", "action", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          resource: { type: "string", example: "drive" },
          action: { type: "string", example: "read" },
          description: { type: "string", nullable: true, example: "Read access to Drive files" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SafeResourcePermission: {
        type: "object",
        required: ["id", "resourceType", "resourceId", "principalType", "principalId", "permissionId", "effect", "grantedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          resourceType: { type: "string", example: "drive_file" },
          resourceId: { type: "string", format: "uuid" },
          principalType: { type: "string", enum: ["USER", "APPLICATION", "SYSTEM"] },
          principalId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          permissionId: { type: "string", format: "uuid" },
          effect: { type: "string", enum: ["allow", "deny"], example: "allow" },
          grantedAt: { type: "string", format: "date-time" },
          revokedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
          permission: { $ref: "#/components/schemas/SafePermission" },
        },
      },
      CreatePermissionRequest: {
        type: "object",
        required: ["resource", "action"],
        properties: {
          resource: { type: "string", example: "drive" },
          action: { type: "string", example: "read" },
          description: { type: "string", example: "Read access to Drive files" },
        },
      },
      GrantResourcePermissionRequest: {
        type: "object",
        required: ["resourceType", "resourceId", "principalType", "principalId", "permissionId"],
        properties: {
          resourceType: { type: "string", example: "drive_file" },
          resourceId: { type: "string", format: "uuid" },
          principalType: { type: "string", enum: ["USER", "APPLICATION", "SYSTEM"] },
          principalId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          permissionId: { type: "string", format: "uuid" },
          expiresAt: { type: "string", format: "date-time", description: "Optional expiration time" },
        },
      },
      RevokeResourcePermissionRequest: {
        type: "object",
        required: ["resourceType", "resourceId", "principalType", "principalId", "permissionId"],
        properties: {
          resourceType: { type: "string", example: "drive_file" },
          resourceId: { type: "string", format: "uuid" },
          principalType: { type: "string", enum: ["USER", "APPLICATION", "SYSTEM"] },
          principalId: { type: "string", example: "550e8400-e29b-41d4-a716-446655440000" },
          permissionId: { type: "string", format: "uuid" },
        },
      },
      PermissionsResponse: {
        type: "object",
        required: ["permissions"],
        properties: {
          permissions: {
            type: "array",
            items: { $ref: "#/components/schemas/SafePermission" },
          },
        },
      },
      ResourcePermissionsResponse: {
        type: "object",
        required: ["permissions"],
        properties: {
          permissions: {
            type: "array",
            items: { $ref: "#/components/schemas/SafeResourcePermission" },
          },
        },
      },
      InsufficientScopeResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "INSUFFICIENT_SCOPE" },
              message: { type: "string", example: "Application does not have the required scope" },
            },
          },
        },
      },
      InsufficientPermissionResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "INSUFFICIENT_PERMISSION" },
              message: { type: "string", example: "You do not have permission to perform this action" },
            },
          },
        },
      },
    },
  },
  paths: {
    // ─── Health ────────────────────────────────────────────────
    "/health": {
      get: {
        tags: ["Health"],
        operationId: "healthCheck",
        summary: "Health check",
        description: "Returns server health status",
        responses: {
          "200": {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/health/db": {
      get: {
        tags: ["Health"],
        operationId: "databaseHealthCheck",
        summary: "Database health check",
        description: "Checks database connectivity",
        responses: {
          "200": {
            description: "Database is connected",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    database: { type: "string", example: "connected" },
                  },
                },
              },
            },
          },
          "503": {
            description: "Database is disconnected",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "error" },
                    database: { type: "string", example: "disconnected" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── Auth ──────────────────────────────────────────────────
    "/api/v1/auth/register": {
      post: {
        tags: ["Authentication"],
        operationId: "register",
        summary: "Register new user",
        description:
          "Creates a new user account. Returns access token and refresh token.\n\nUser status will be `pending` until email verification is implemented.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "User registered successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResult" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "409": {
            description: "Email or username already taken",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConflictResponse" },
              },
            },
          },
          "429": {
            description: "Rate limit exceeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RateLimitResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Authentication"],
        operationId: "login",
        summary: "Login",
        description:
          "Authenticates a user by email or username. Returns access token and refresh token.\n\nFailed attempts increment a counter. After 5 failed attempts, the account is locked for 15 minutes.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthResult" },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "423": {
            description: "Account locked after too many failed attempts",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AccountLockedResponse" },
              },
            },
          },
          "429": {
            description: "Rate limit exceeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RateLimitResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/refresh": {
      post: {
        tags: ["Authentication"],
        operationId: "refreshToken",
        summary: "Refresh access token",
        description:
          "Exchanges a refresh token for a new access token and refresh token. The old refresh token is revoked (rotation).\n\nCan be sent in request body (API/mobile) or as an httpOnly cookie (web).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Token refreshed successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RefreshResult" },
              },
            },
          },
          "401": {
            description: "Invalid, expired, or revoked refresh token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Authentication"],
        operationId: "logout",
        summary: "Logout",
        description: "Revokes the current session. Requires Bearer JWT authentication.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
        },
      },
    },

    // ─── Users ─────────────────────────────────────────────────
    "/api/v1/me": {
      get: {
        tags: ["Users"],
        operationId: "getCurrentUser",
        summary: "Get current user",
        description: "Returns the authenticated user's profile. Requires Bearer JWT authentication.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "User profile",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["user"],
                  properties: {
                    user: { $ref: "#/components/schemas/SafeUser" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
        },
      },
    },

    // ─── Sessions ──────────────────────────────────────────────
    "/api/v1/sessions": {
      get: {
        tags: ["Sessions"],
        operationId: "listSessions",
        summary: "List sessions",
        description: "Returns all sessions for the authenticated user. Requires Bearer JWT authentication.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SessionsResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Sessions"],
        operationId: "revokeAllSessions",
        summary: "Revoke all sessions",
        description:
          "Revokes all sessions for the authenticated user. The current session will also be revoked. Requires Bearer JWT authentication.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "All sessions revoked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/sessions/{id}": {
      delete: {
        tags: ["Sessions"],
        operationId: "revokeSession",
        summary: "Revoke a session",
        description:
          "Revokes a specific session by ID. Users can only revoke their own sessions. Requires Bearer JWT authentication.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Session ID",
          },
        ],
        responses: {
          "200": {
            description: "Session revoked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "404": {
            description: "Session not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },

    // ─── Applications ──────────────────────────────────────────
    "/api/v1/applications": {
      post: {
        tags: ["Applications"],
        operationId: "createApplication",
        summary: "Create application",
        description:
          "Creates a new application in the registry. Returns the application with a one-time client secret.\n\n**IMPORTANT:** The `clientSecret` is only shown once. Save it securely - it cannot be retrieved later.\n\nRequires administrator privileges.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateApplicationRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Application created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApplicationWithSecret" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "409": {
            description: "Application slug already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConflictResponse" },
              },
            },
          },
        },
      },
      get: {
        tags: ["Applications"],
        operationId: "listApplications",
        summary: "List applications",
        description: "Returns all registered applications. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "List of applications",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApplicationsResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/applications/{id}": {
      get: {
        tags: ["Applications"],
        operationId: "getApplication",
        summary: "Get application",
        description: "Returns a specific application by ID. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        responses: {
          "200": {
            description: "Application details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["application"],
                  properties: {
                    application: { $ref: "#/components/schemas/SafeApplication" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      patch: {
        tags: ["Applications"],
        operationId: "updateApplication",
        summary: "Update application",
        description:
          "Updates an application. Only `name`, `redirectUris`, and `status` can be modified. `slug` and `clientId` are immutable. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateApplicationRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Application updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["application"],
                  properties: {
                    application: { $ref: "#/components/schemas/SafeApplication" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Applications"],
        operationId: "deleteApplication",
        summary: "Disable application",
        description:
          "Soft-disables an application by setting status to `disabled`. Does not physically delete the application. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        responses: {
          "204": {
            description: "Application disabled",
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/applications/{id}/rotate-secret": {
      post: {
        tags: ["Applications"],
        operationId: "rotateApplicationSecret",
        summary: "Rotate client secret",
        description:
          "Generates a new client secret for the application. The old secret is immediately invalidated.\n\n**IMPORTANT:** The new `clientSecret` is only shown once. Save it securely.\n\nRequires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        responses: {
          "200": {
            description: "New client secret generated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ClientSecretResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },

    // ─── Application Scopes ────────────────────────────────────
    "/api/v1/applications/{id}/scopes": {
      post: {
        tags: ["Applications"],
        operationId: "createApplicationScope",
        summary: "Create application scope",
        description:
          "Adds a new scope to an application. Scopes follow the `<resource>:<action>` pattern (e.g., `drive:read`). Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateScopeRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Scope created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["scope"],
                  properties: {
                    scope: { $ref: "#/components/schemas/ApplicationScope" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "409": {
            description: "Scope already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConflictResponse" },
              },
            },
          },
        },
      },
      get: {
        tags: ["Applications"],
        operationId: "listApplicationScopes",
        summary: "List application scopes",
        description: "Returns all scopes for an application. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        responses: {
          "200": {
            description: "List of scopes",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ScopesResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/applications/{id}/scopes/{scopeId}": {
      delete: {
        tags: ["Applications"],
        operationId: "deleteApplicationScope",
        summary: "Delete application scope",
        description: "Removes a scope from an application. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
          {
            name: "scopeId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Scope ID",
          },
        ],
        responses: {
          "204": {
            description: "Scope deleted",
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application or scope not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },

    // ─── User Application Access ───────────────────────────────
    "/api/v1/applications/{id}/access": {
      post: {
        tags: ["Applications"],
        operationId: "grantUserApplicationAccess",
        summary: "Grant user access to application",
        description:
          "Grants a user access to an application with specified scopes. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GrantAccessRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Access granted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["access"],
                  properties: {
                    access: { $ref: "#/components/schemas/UserApplicationAccess" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application or user not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "409": {
            description: "User already has access",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConflictResponse" },
              },
            },
          },
        },
      },
      get: {
        tags: ["Applications"],
        operationId: "listUserApplicationAccess",
        summary: "List user access for application",
        description: "Returns all user access grants for an application. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
        ],
        responses: {
          "200": {
            description: "List of access grants",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AccessResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/applications/{id}/access/{accessId}": {
      delete: {
        tags: ["Applications"],
        operationId: "revokeUserApplicationAccess",
        summary: "Revoke user access to application",
        description: "Revokes a user's access to an application. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Application ID",
          },
          {
            name: "accessId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Access grant ID",
          },
        ],
        responses: {
          "204": {
            description: "Access revoked",
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Application or access grant not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },

    // ─── Permissions ────────────────────────────────────────────
    "/api/v1/permissions": {
      post: {
        tags: ["Permissions"],
        operationId: "createPermission",
        summary: "Create permission",
        description:
          "Creates a new permission in the catalogue. Permissions follow the `<resource>:<action>` pattern.\n\nRequires administrator privileges.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePermissionRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Permission created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["permission"],
                  properties: {
                    permission: { $ref: "#/components/schemas/SafePermission" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "409": {
            description: "Permission already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConflictResponse" },
              },
            },
          },
        },
      },
      get: {
        tags: ["Permissions"],
        operationId: "listPermissions",
        summary: "List permissions",
        description: "Returns all permissions in the catalogue. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "List of permissions",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PermissionsResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/permissions/{id}": {
      get: {
        tags: ["Permissions"],
        operationId: "getPermission",
        summary: "Get permission",
        description: "Returns a specific permission by ID. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Permission ID",
          },
        ],
        responses: {
          "200": {
            description: "Permission details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["permission"],
                  properties: {
                    permission: { $ref: "#/components/schemas/SafePermission" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Permission not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Permissions"],
        operationId: "deletePermission",
        summary: "Delete permission",
        description: "Deletes a permission from the catalogue. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Permission ID",
          },
        ],
        responses: {
          "204": {
            description: "Permission deleted",
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Permission not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/permissions/grant": {
      post: {
        tags: ["Permissions"],
        operationId: "grantResourcePermission",
        summary: "Grant resource permission",
        description:
          "Grants a permission on a specific resource to a principal (user/application/system).\n\nRequires administrator privileges.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GrantResourcePermissionRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Permission granted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["permission"],
                  properties: {
                    permission: { $ref: "#/components/schemas/SafeResourcePermission" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
          "404": {
            description: "Permission not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/permissions/revoke": {
      post: {
        tags: ["Permissions"],
        operationId: "revokeResourcePermission",
        summary: "Revoke resource permission",
        description:
          "Revokes a previously granted permission on a resource.\n\nRequires administrator privileges.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RevokeResourcePermissionRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Permission revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["revoked"],
                  properties: {
                    revoked: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/permissions/resource/{type}/{id}": {
      get: {
        tags: ["Permissions"],
        operationId: "listResourcePermissions",
        summary: "List resource permissions",
        description: "Returns all active permissions for a specific resource. Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "type",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Resource type (e.g., drive_file, note)",
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Resource ID",
          },
        ],
        responses: {
          "200": {
            description: "List of resource permissions",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResourcePermissionsResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/permissions/principal/{type}/{id}": {
      get: {
        tags: ["Permissions"],
        operationId: "listPrincipalPermissions",
        summary: "List principal permissions",
        description: "Returns all active permissions for a specific principal (user/application/system). Requires administrator privileges.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "type",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["USER", "APPLICATION", "SYSTEM"] },
            description: "Principal type",
          },
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Principal ID",
          },
        ],
        responses: {
          "200": {
            description: "List of principal permissions",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResourcePermissionsResponse" },
              },
            },
          },
          "401": {
            description: "Missing or invalid authentication",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnauthorizedResponse" },
              },
            },
          },
          "403": {
            description: "Administrator privileges required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForbiddenResponse" },
              },
            },
          },
        },
      },
    },
  },
};
