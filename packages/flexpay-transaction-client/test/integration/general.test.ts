import { FlexPayTransactionClient, sandbox, PaymentModel, ChargeCreditCardRequest, ResponseError, SortOrder, ResponseCode, CreateCreditCardPaymentMethodRequest, CreateTokenizedPaymentMethodRequest, AuthorizeCreditCardRequest } from "../../src";
import { consoleJson, generateUniqueMerchantReferenceId, sleep } from "../test-helper";
jest.setTimeout(300000);	// 5 minutes

let GATEWAY_TOKEN:string;
let AUTHORIZATION_TOKEN:string;
let client:FlexPayTransactionClient;

beforeAll(() => {
	consoleJson(undefined);	// Just calling this so TS doesn't complain about the import

	GATEWAY_TOKEN = process.env["X_FP_GATEWAY_TOKEN"] as string;
	AUTHORIZATION_TOKEN = process.env["X_FP_AUTH_TOKEN"] as string;
	client = new FlexPayTransactionClient({
		authorizationToken: AUTHORIZATION_TOKEN,
		debugOutput: true,
	});
});

beforeEach(() => {
	jest.resetAllMocks();
	jest.restoreAllMocks();
});

function getBasicCreditCardPaymentMethodRequest<T>(requestOverride?:Record<string, unknown>|undefined, creditCardOverride?:Record<string, unknown>|undefined):T {
	const paymentMethod:unknown = {
		customerId: "basic test customer",
		creditCard: {
			creditCardNumber: sandbox.creditCards.visa.creditCardNumber,
			expiryMonth: sandbox.creditCards.visa.expiryMonth,
			expiryYear: sandbox.creditCards.visa.expiryYear,
			cvv: sandbox.creditCards.visa.cvv,
			firstName: "John",
			lastName: "Doe",
			fullName: null,
			address1: "",
			address2: null,
			postalCode: "",
			city: "",
			state: "",
			country: "",
			email: null,
			phoneNumber: null,
			...creditCardOverride,
		},
		...requestOverride,
	};

	return paymentMethod as T;
};

function getBasicTokenizedPaymentMethodRequest<T>(requestOverride?:Record<string, unknown>|undefined, paymentMethodOverride?:Record<string, unknown>|undefined) {
	return {
		customerId: "integration test customer 2",
		gatewayPaymentMethod: {
			gatewayPaymentMethodId: "GWPMID-TEST1",
			merchantAccountReferenceId: "TEST-GATEWAY",
			firstSixDigits: sandbox.creditCards.visa.creditCardNumber.slice(0, 6),
			lastFourDigits: sandbox.creditCards.visa.creditCardNumber.slice(-4),
			expiryMonth: sandbox.creditCards.visa.expiryMonth,
			expiryYear: sandbox.creditCards.visa.expiryYear,
			firstName: "John",
			lastName: "Doe",
			fullName: null,
			address1: "",
			address2: null,
			postalCode: "",
			city: "",
			state: "",
			country: "",
			email: null,
			phoneNumber: null,
			...paymentMethodOverride
		},
		...requestOverride,
	} as T;
}


describe("Health Check", () => {
	it("should report healthy", async () => {
		const isHealthy = await client.healthCheck.healthCheck();
		expect(isHealthy).toEqual(true);
	})
});

describe("Payment Methods", () => {
	it("should create a credit card", async () => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(
			getBasicCreditCardPaymentMethodRequest<CreateCreditCardPaymentMethodRequest>({
				customerId: "integration test customer 1",
			}),
		);

		expect(response.responseCode, "Credit Card Payment Method approved").toEqual(ResponseCode.Approved);
	});

	it("should fail on invalid card data", async () => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(
			getBasicCreditCardPaymentMethodRequest<CreateCreditCardPaymentMethodRequest>({
				customerId: "integration test customer 2",
			}, {
				creditCardNumber: "123456",
			}
		));
		expect(response.responseCode, "Credit Card Payment Method: Card number too short").toEqual(ResponseCode.ApiInvalidCreditCardNumberLength);
	});

	it("should create a tokenized payment method", async () => {
		const response = await client.paymentMethods.createdTokenizedPaymentMethod(
			getBasicTokenizedPaymentMethodRequest({
				customerId: "integration test customer 2",
			})
		);
		expect(response.responseCode, "Tokenized Payment Method approved").toEqual(ResponseCode.Approved);
	});

	it("should fail on invalid tokenized payment method data", async () => {
		const response = await client.paymentMethods.createdTokenizedPaymentMethod(
			getBasicTokenizedPaymentMethodRequest({
				customerId: "integration test customer 3",
			}, {
				firstName: "",
				lastName: "",
				fullName: null,
			})
		);
		expect(response.responseCode, "Tokenized Payment Method missing name fields").toEqual(ResponseCode.ApiFullnameOrFirstLastRequired);
	});

	it("should a list of payment methods", async () => {
		let paymentMethods = await client.paymentMethods.getPaymentMethodList(null, 1, SortOrder.Descending);
		expect(paymentMethods.length, "Get a list of payment methods").toBeGreaterThanOrEqual(1);

		paymentMethods = await client.paymentMethods.getPaymentMethodList(paymentMethods[paymentMethods.length - 1].paymentMethodId, 1, SortOrder.Descending);
		expect(paymentMethods.length, "Get the next page of payment methods").toBeGreaterThanOrEqual(1);
	});

	it("should get a payment method", async () => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest());
		expect(response.responseCode, "Credit Card Payment Method approved").toEqual(ResponseCode.Approved);

		const paymentMethod = await client.paymentMethods.getPaymentMethod(response.paymentMethod.paymentMethodId);
		expect(paymentMethod, "Loaded payment method should match").toMatchObject(response.paymentMethod);

	});

	it.skip("should update a payment method", async () => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest(undefined, {
			firstName: "John",
			email: "jdoe@example.com",
		}));
		expect(response.responseCode, "Credit Card Payment Method approved").toEqual(ResponseCode.Approved);

		const propertiesToUpdate = {
			firstName: "Jane",
			email: null,
		};

		const updateResponse = await client.paymentMethods.updatePaymentMethod(response.paymentMethod.paymentMethodId, propertiesToUpdate);
		expect(updateResponse.responseCode, "Update payment method should be approved").toEqual(ResponseCode.Approved);

		expect(updateResponse, "Update Payment response object should match the expected results").toMatchObject({
			responseCode: ResponseCode.Approved,
			paymentMethod: expect.objectContaining(propertiesToUpdate),
		});
	});

	it("should fail to update a payment method with update data", async () => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest());
		expect(response.responseCode, "Credit Card Payment Method approved").toEqual(ResponseCode.Approved);

		try {
			await client.paymentMethods.updatePaymentMethod(response.paymentMethod.paymentMethodId, { });
			expect("Update payment method should should have thrown").toBeFalsy();
		} catch (ex) {
			expect(ex).toBeInstanceOf(ResponseError);
			expect((ex as Error).message).toContain("no editable field");
		}
	});

	it("should fail to update a payment method with invalid data", async () => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest());
		expect(response.responseCode, "Credit Card Payment Method approved").toEqual(ResponseCode.Approved);

		try {
			await client.paymentMethods.updatePaymentMethod(response.paymentMethod.paymentMethodId, {
				lastName: "",
			});
			expect("Update payment method should should have thrown").toBeFalsy();
		} catch (ex) {
			expect(ex).toBeInstanceOf(ResponseError);
			expect((ex as Error).message).toContain("no editable field");
		}
	});

	it.skip("should redact a payment method", async () => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest());
		expect(response.responseCode, "Credit Card Payment Method approved").toEqual(ResponseCode.Approved);

		const redactResponse = await client.paymentMethods.redactPaymentMethod(response.paymentMethod.paymentMethodId);
		expect(redactResponse.responseCode, "Payment method Redact command should be approved").toEqual(ResponseCode.Approved);

		const getResponse = await client.paymentMethods.getPaymentMethod(response.paymentMethod.paymentMethodId);
		expect(getResponse.creditCardNumber, "Payment method credit card number should be removed").toEqual("");
	});

	it.skip.each([
		["Made up CVV", "999"],
		["Sandbox CVV", sandbox.creditCards.visa.cvv],
		["Null CVV", null]
	])("should recache the CVV value (%s: %s)", async (testName:string, cvv:string|null) => {
		const response = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest());
		expect(response.responseCode, "Credit Card Payment Method approved").toEqual(ResponseCode.Approved);

		const recacheResponse = await client.paymentMethods.recacheCvv(response.paymentMethod.paymentMethodId, cvv);
		expect(recacheResponse.responseCode).toEqual(ResponseCode.Approved);
	});
});

describe("Transactions", () => {
	it("should load pages of transactions", async () => {
		// Get list - set list size and order
		let transactions = await client.transactions.getTransactionList(null, 10, SortOrder.Descending);
		expect(transactions.length, "Should have gotten a list back").toBeGreaterThanOrEqual(1);

		if (transactions.length > 0) {
			// Get the next page of transactions
			transactions = await client.transactions.getTransactionList(transactions[transactions.length - 1].transactionId, 10, SortOrder.Descending);
			expect(transactions.length, "Should have gotten the next page").toBeGreaterThanOrEqual(0);
		} else {
			expect("Insufficient transactions to test", "Could not complete transaction API tests because too few transactions were returned from the getTransactionList call").toBeFalsy();
		}
	});

	it("should load a transaction by transactionId and by merchantTransactionId", async () => {
		// Note: the getTransaction and getTransactionByMerchantTransactionId tests are combined because loading a
		//  list of transactions does not provide the merchantTransactionId.

		// Get list
		const transactions = await client.transactions.getTransactionList(null, 1);
		expect(transactions.length, "Should have gotten a list back").toBeGreaterThanOrEqual(1);

		// Load by transactionId
		const transaction = await client.transactions.getTransaction(transactions[0].transactionId);
		expect(transaction.transactionId, "Should have loaded the transaction").toEqual(transactions[0].transactionId);

		// Load by merchantTransactionId
		const transactionByM = await client.transactions.getTransactionByMerchantTransactionId(transaction.merchantTransactionId);
		expect(transactionByM.merchantTransactionId, "Should have loaded the transaction by merchantTransactionId").toEqual(transaction.merchantTransactionId);
	});
});

describe("Charge", () => {
	function getBasicChargeRequest(override?:Record<string, unknown>):ChargeCreditCardRequest {
		const request:ChargeCreditCardRequest = {
			amount: 1000,	// $10.00
			currencyCode: "USD",
			customerId: "test",
			customerIp: "196.168.1.123",
			dateFirstAttempt: new Date(),
			description: "Test charge",
			gatewayToken: GATEWAY_TOKEN,
			disableCustomerRecovery: false,
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "01234",
			paymentMethod: {
				address1: "123 A St",
				address2: null,
				city: "Townsville",
				state: "UT",
				postalCode: "84062",
				country: "US",

				creditCardNumber: sandbox.creditCards.visa.creditCardNumber,
				cvv: sandbox.creditCards.visa.cvv,
				expiryMonth: sandbox.creditCards.visa.expiryMonth,
				expiryYear: sandbox.creditCards.visa.expiryYear,
				phoneNumber: "8015551234",
				email: "johndoe@example.com",
				firstName: "John",
				lastName: "Doe",
				fullName: null,
				merchantAccountReferenceId: null,
			},
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			paymentModel: PaymentModel.Subscription,
			paymentPlan: {
				billingCycle: 1,
				billingPlan: null,
				category: null,
				sku: null
			},
			shippingAddress: {
				address1: "123 A St",
				address2: null,
				city: "Townsville",
				state: "UT",
				postalCode: "84062",
				country: "US",
			},
			referenceData: null,
			References: {
				PreviousTransaction: {
					gatewayCode: null,
					gatewayMesage: null,
					merchantAccountReferenceId: null,
					transactionDate: null
				}
			},
			retainOnSuccess: false,
			retryCount: 1,
			...override,
		};

		return request;
	}

	it("should approve a credit card", async () => {
		const chargeRequest = getBasicChargeRequest();
		const transaction = await client.charge.chargeCreditCard(chargeRequest);
		expect(transaction.responseCode, "Credit Card Charge should be created").toEqual(ResponseCode.Approved);

		await sleep(6);	// Wait to see if the transaction will be available. In manual tests the wait time has been highly variable.

		// Load the transaction so we can verify it exists
		try {
			const reloadedTransaction = await client.transactions.getTransaction(transaction.transactionId);
			expect(reloadedTransaction.transactionId, "Should have loaded the transaction").toEqual(transaction.transactionId);
		} catch (ex) {
			expect(ex, "Should not have thrown when getting the Charge transaction").toBeFalsy();
		}
	});

	it("should fail if a malformed payload is sent", async () => {
		const chargeRequest = getBasicChargeRequest({ dateFirstAttempt: "bad value" });

		try {
			await client.charge.chargeCreditCard(chargeRequest)
		} catch (ex) {
			expect(ex, "Should have thrown a ResponseError").toBeInstanceOf(ResponseError);
		}
	});

	it.skip("should retain the payment info in the vault", async () => {
		const chargeRequest = getBasicChargeRequest({
			retainOnSuccess: true,
		});
		const transaction = await client.charge.chargeCreditCard(chargeRequest);
		expect(transaction, "Credit Card Charge should be created with retained payment method").toMatchObject({
			responseCode: ResponseCode.Approved,
			paymentMethod: expect.objectContaining({
				paymentMethodId: expect.stringMatching(/[A-Z0-9]+/),
			}),
		});

		if (transaction.paymentMethod.paymentMethodId) {
			// Load the payment method so we can verify it exists
			try {
				const retainedPaymentMethod = await client.paymentMethods.getPaymentMethod(transaction.paymentMethod.paymentMethodId);
				expect(retainedPaymentMethod.paymentMethodId, "Should have loaded the payment method").toEqual(transaction.paymentMethod.paymentMethodId);
			} catch (ex) {
				expect(ex, "Should not have thrown when getting the retained payment method").toBeFalsy();
			}
		} else {
			expect("Should have had a paymentMethodId in the response but did not").toBeFalsy();
		}
	});

	it.skip("should charge a stored payment method", async () => {
		const paymentMethod = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest());
		expect(paymentMethod).toMatchObject({
			responseCode: ResponseCode.Approved,
			paymentMethod: {
				paymentMethodId: expect.stringMatching(/[A-Z0-9]+/),
			},
		});

		const transaction = await client.charge.chargeTokenizedPaymentMethod({
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "O1111",
			description: null,
			customerId: "test customer 45342",
			currencyCode: "USD",
			amount: 1000,
			paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
			customerIp: null,
			shippingAddress: null,
			gatewayToken: GATEWAY_TOKEN,
			paymentPlan: null,
			retryCount: 1,
			dateFirstAttempt: null,
			referenceData: null,
			disableCustomerRecovery: false,
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			References: null
		});
		expect(transaction, "Tokenized Payment Method Charge should be created").toMatchObject({
			responseCode: ResponseCode.Approved,
		});
	});

	it.skip("should fail to charge a non-existent tokenized payment method", async () => {
		const transaction = await client.charge.chargeTokenizedPaymentMethod({
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "O1111",
			description: null,
			customerId: "test customer 45342",
			currencyCode: "USD",
			amount: 1000,
			paymentMethodId: "TOTALLYMADEUP",
			customerIp: null,
			shippingAddress: null,
			gatewayToken: GATEWAY_TOKEN,
			paymentPlan: null,
			retryCount: 1,
			dateFirstAttempt: null,
			referenceData: null,
			disableCustomerRecovery: false,
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			References: null
		});
		expect(transaction, "Tokenized Payment Method Charge should fail because the paymentMethodId was made up").toMatchObject({
			responseCode: ResponseCode.ApiInvalidPaymentMethod,
		});
	});

	it("should charge a gateway payment method", async () => {
		const gatewayPaymentMethodRequest = getBasicTokenizedPaymentMethodRequest<CreateTokenizedPaymentMethodRequest>();
		const paymentMethod = await client.paymentMethods.createdTokenizedPaymentMethod(gatewayPaymentMethodRequest);
		expect(paymentMethod).toMatchObject({
			responseCode: ResponseCode.Approved,
			paymentMethod: {
				paymentMethodId: expect.stringMatching(/[A-Z0-9]+/),
			},
		});

		const transaction = await client.charge.chargeGatewayPaymentMethod({
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "O1111",
			description: null,
			customerId: "test customer 45342",
			currencyCode: "USD",
			amount: 1000,
			paymentMethod: {
				gatewayPaymentMethodId: paymentMethod.paymentMethod.gatewayPaymentMethodId,
				merchantAccountReferenceId: paymentMethod.paymentMethod.merchantAccountReferenceId,
				firstName: "Joe",
				lastName: "Smith",
				postalCode: "84062",
				city: "Pleasant Grove",
				state: "UT",
			},
			customerIp: null,
			shippingAddress: null,
			gatewayToken: GATEWAY_TOKEN,
			paymentPlan: null,
			retryCount: 1,
			dateFirstAttempt: null,
			referenceData: null,
			disableCustomerRecovery: false,
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			References: null
		});
		expect(transaction, "Tokenized Payment Method Charge should be approved").toMatchObject({
			responseCode: ResponseCode.Approved,
		});
	});

});

describe("Authorize", () => {
	function getBasicAuthRequest(override?:Record<string, unknown>):AuthorizeCreditCardRequest {
		const request:AuthorizeCreditCardRequest = {
			amount: 1000,	// $10.00
			currencyCode: "USD",
			customerId: "test",
			customerIp: "196.168.1.123",
			dateFirstAttempt: new Date(),
			description: "Test charge",
			gatewayToken: GATEWAY_TOKEN,
			disableCustomerRecovery: false,
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "01234",
			paymentMethod: {
				address1: "123 A St",
				address2: null,
				city: "Townsville",
				state: "UT",
				postalCode: "84062",
				country: "US",

				creditCardNumber: sandbox.creditCards.visa.creditCardNumber,
				cvv: sandbox.creditCards.visa.cvv,
				expiryMonth: sandbox.creditCards.visa.expiryMonth,
				expiryYear: sandbox.creditCards.visa.expiryYear,
				phoneNumber: "8015551234",
				email: "johndoe@example.com",
				firstName: "John",
				lastName: "Doe",
				fullName: null,
				merchantAccountReferenceId: null,
			},
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			paymentModel: PaymentModel.Subscription,
			paymentPlan: {
				billingCycle: null,
				billingPlan: null,
				category: null,
				sku: null
			},
			shippingAddress: {
				address1: "123 A St",
				address2: null,
				city: "Townsville",
				state: "UT",
				postalCode: "84062",
				country: "US",
			},
			referenceData: null,
			References: {
				PreviousTransaction: {
					gatewayCode: null,
					gatewayMesage: null,
					merchantAccountReferenceId: null,
					transactionDate: null
				}
			},
			retainOnSuccess: false,
			retryCount: 1,
			...override,
		};

		return request;
	}

	it("should approve a credit card", async () => {
		const transaction = await client.authorize.authorizeCreditCard(getBasicAuthRequest());
		expect(transaction.responseCode, "Credit Card Auth should be created").toEqual(ResponseCode.Approved);

		await sleep(6);	// Wait to see if the transaction will be available. In manual tests the wait time has been highly variable (2 ~ 10 seconds).

		// Load the transaction so we can verify it exists
		try {
			const reloadedTransaction = await client.transactions.getTransaction(transaction.transactionId);
			expect(reloadedTransaction.transactionId, "Should have loaded the transaction").toEqual(transaction.transactionId);
		} catch (ex) {
			expect(ex, "Should not have thrown when getting the Auth transaction").toBeFalsy();
		}
	});

	it("should fail if a malformed payload is sent", async () => {
		const request = getBasicAuthRequest({ dateFirstAttempt: "bad value" });

		try {
			await client.authorize.authorizeCreditCard(request)
		} catch (ex) {
			expect(ex, "Should have thrown a ResponseError").toBeInstanceOf(ResponseError);
		}
	});

	it.skip("should retain the payment info in the vault", async () => {
		const request = getBasicAuthRequest({
			retainOnSuccess: true,
		});
		const transaction = await client.authorize.authorizeCreditCard(request);
		expect(transaction, "Credit Card Auth should be created with retained payment method").toMatchObject({
			responseCode: ResponseCode.Approved,
			paymentMethod: expect.objectContaining({
				paymentMethodId: expect.stringMatching(/[A-Z0-9]+/),
			}),
		});

		if (transaction.paymentMethod.paymentMethodId) {
			// Load the payment method so we can verify it exists
			try {
				const retainedPaymentMethod = await client.paymentMethods.getPaymentMethod(transaction.paymentMethod.paymentMethodId);
				expect(retainedPaymentMethod.paymentMethodId, "Should have loaded the payment method").toEqual(transaction.paymentMethod.paymentMethodId);
			} catch (ex) {
				expect(ex, "Should not have thrown when getting the retained payment method").toBeFalsy();
			}
		} else {
			expect("Should have had a paymentMethodId in the response but did not").toBeFalsy();
		}
	});

	it.skip("should auth a stored payment method", async () => {
		const paymentMethod = await client.paymentMethods.createCreditCardPaymentMethod(getBasicCreditCardPaymentMethodRequest());
		expect(paymentMethod).toMatchObject({
			responseCode: ResponseCode.Approved,
			paymentMethod: {
				paymentMethodId: expect.stringMatching(/[A-Z0-9]+/),
			},
		});

		const transaction = await client.authorize.authorizeTokenizedPaymentMethod({
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "O1111",
			description: null,
			customerId: "test customer 45342",
			currencyCode: "USD",
			amount: 1000,
			paymentMethodId: paymentMethod.paymentMethod.paymentMethodId,
			customerIp: null,
			shippingAddress: null,
			gatewayToken: GATEWAY_TOKEN,
			paymentPlan: null,
			retryCount: 1,
			dateFirstAttempt: null,
			referenceData: null,
			disableCustomerRecovery: false,
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			References: null
		});
		expect(transaction, "Tokenized Payment Method Auth should be created").toMatchObject({
			responseCode: ResponseCode.Approved,
		});
	});

	it.skip("should fail to auth a non-existent tokenized payment method", async () => {
		const transaction = await client.authorize.authorizeTokenizedPaymentMethod({
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "O1111",
			description: null,
			customerId: "test customer 45342",
			currencyCode: "USD",
			amount: 1000,
			paymentMethodId: "TOTALLYMADEUP",
			customerIp: null,
			shippingAddress: null,
			gatewayToken: GATEWAY_TOKEN,
			paymentPlan: null,
			retryCount: 1,
			dateFirstAttempt: null,
			referenceData: null,
			disableCustomerRecovery: false,
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			References: null
		});
		expect(transaction, "Tokenized Payment Method Auth should fail because the paymentMethodId was made up").toMatchObject({
			responseCode: ResponseCode.ApiInvalidValueForPaymentToken,
		});
	});

	it("should auth a gateway payment method", async () => {
		const gatewayPaymentMethodRequest = getBasicTokenizedPaymentMethodRequest<CreateTokenizedPaymentMethodRequest>();
		const paymentMethod = await client.paymentMethods.createdTokenizedPaymentMethod(gatewayPaymentMethodRequest);
		expect(paymentMethod).toMatchObject({
			responseCode: ResponseCode.Approved,
			paymentMethod: {
				paymentMethodId: expect.stringMatching(/[A-Z0-9]+/),
			},
		});

		const transaction = await client.authorize.authorizeGatewayPaymentMethod({
			merchantTransactionId: generateUniqueMerchantReferenceId(),
			orderId: "O1111",
			description: null,
			customerId: "test customer 45342",
			currencyCode: "USD",
			amount: 1000,
			paymentMethod: {
				gatewayPaymentMethodId: paymentMethod.paymentMethod.gatewayPaymentMethodId,
				merchantAccountReferenceId: paymentMethod.paymentMethod.merchantAccountReferenceId,
				firstName: "Joe",
				lastName: "Smith",
				postalCode: "84062",
				city: "Pleasant Grove",
				state: "UT",
			},
			customerIp: null,
			shippingAddress: null,
			gatewayToken: GATEWAY_TOKEN,
			paymentPlan: null,
			retryCount: 1,
			dateFirstAttempt: null,
			referenceData: null,
			disableCustomerRecovery: false,
			customVariable1: null,
			customVariable2: null,
			customVariable3: null,
			customVariable4: null,
			customVariable5: null,
			References: null
		});
		expect(transaction, "Tokenized Payment Method Auth should be approved").toMatchObject({
			responseCode: ResponseCode.Approved,
		});
	});
})

// Capture API tests

// Void API tests

// Refund API tests