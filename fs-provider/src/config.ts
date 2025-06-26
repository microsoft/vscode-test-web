/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Config {
	serverUri: string;
}

// Production configuration
const productionConfig: Config = {
	serverUri: 'http://www.prod.com:8000',
};

// Int configuration
const intConfig: Config = {
	serverUri: 'http://www.int.com:8000',
};

// Local configuration
const localConfig: Config = {
	serverUri: 'http://localhost:3000',
};

// Get configuration based on environment
export function getConfig(): Config {
	// Check if we're in int mode
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'int') {
		return intConfig;
	}

	// Check if we're in production mode
	if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
		return productionConfig;
	}

	// Default to local config
	return localConfig;
}

// Export the current configuration
export const config = getConfig();