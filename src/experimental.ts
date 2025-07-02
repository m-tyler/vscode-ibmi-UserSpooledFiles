/**
 * Describes the purpose of the function.
 * @param {string} paramName - Description of the parameter.
 * @param {number} anotherParam - Description of another parameter.
 * @returns {boolean} Description of what the function returns.
 */
export function myFunction(paramName: string, anotherParam: number): boolean {
  // Function implementation
  return true;
}

/**
 * Represents a user profile.
 * @typedef {object} UserProfile
 * @property {string} name - The user's name.
 * @property {number} age - The user's age.
 * @property {string} [email] - Optional email address.
 */
export type UserProfile = {
  name: string;
  age: number;
  email?: string;
};

/**
 * Updates a user's profile information.
 * @param {UserProfile} user - The user profile object to update.
 * @param {boolean} [notifyUser=false] - optional, Whether to send a notification to the user.
 * @param {string} extraParm - optional, extra stuff you want to pass in.
 * @returns {void}
 */
export function updateUser(user: UserProfile, notifyUser: boolean = false): void {
  console.log(`Updating profile for ${user.name}. Age: ${user.age}`);
  if (user.email) {
    console.log(`Email: ${user.email}`);
  }
  if (notifyUser) {
    console.log("Notifying user.");
  }
}