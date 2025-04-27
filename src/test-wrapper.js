// Test wrapper for debugging the fetchEmails function

// Mock implementation of fetchEmails for testing
const mockFetchEmails = (params) => {
  console.log('fetchEmails called with:', JSON.stringify(params));
  return Promise.resolve({ success: true, threads: [] });
};

// Our safe wrapper function
const safeFetchEmails = (service, query = "") => {
  console.log(`Safely dispatching fetchEmails with service: ${service}`);
  // Always make sure we're passing an object
  if (typeof service === 'string') {
    return { service, query };
  } else if (typeof service === 'object' && service !== null) {
    return service;
  } else {
    console.error('Invalid parameter passed to fetchEmails:', service);
    return { service: 'gmail', query: '' }; // Default fallback
  }
};

// Test cases
console.log("=== Testing fetchEmails parameter handling ===");

// Test with string
console.log("\nTest 1: String parameter");
mockFetchEmails(safeFetchEmails("gmail"));

// Test with object
console.log("\nTest 2: Object parameter");
mockFetchEmails(safeFetchEmails({ service: "outlook", query: "important" }));

// Test with null
console.log("\nTest 3: Null parameter");
mockFetchEmails(safeFetchEmails(null));

// Test with undefined
console.log("\nTest 4: Undefined parameter");
mockFetchEmails(safeFetchEmails(undefined));

// Test direct string without wrapper (this is the problematic case)
console.log("\nTest 5: Direct string without wrapper (problematic case)");
try {
  mockFetchEmails("gmail");
  console.log("  ✓ This worked because our mock doesn't validate parameters");
} catch (e) {
  console.error("  ✗ Error:", e.message);
}

console.log("\n=== Tests complete ==="); 