# Calo - Nutrition & Fitness Tracker

A comprehensive nutrition and fitness tracking application with AI-powered meal analysis and device integration.

## Features

### 🍽️ Nutrition Tracking
- AI-powered meal analysis from photos
- Comprehensive nutritional breakdown
- Meal history and favorites
- Custom meal plans and recommendations
- Barcode scanning for packaged foods

### 📱 Device Integration
- **Apple Health** (iOS) - Steps, calories, heart rate, weight
- **Google Fit** (Android/Web) - Activity tracking and health metrics
- **Fitbit** - Sleep, activity, and health data
- **Garmin** - Detailed fitness metrics and training data
- **Whoop** - Recovery, strain, and sleep analysis
- **Samsung Health** (Android) - Comprehensive health tracking
- **Polar** - Heart rate and training data

### 🎯 Goal Tracking
- Personalized daily nutrition goals
- Activity and calorie balance tracking
- Achievement system with XP and levels
- Streak tracking and motivation

### 🤖 AI Features
- Intelligent meal analysis and recommendations
- Personalized nutrition advice
- Chat-based nutrition assistant
- Custom meal plan generation

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- Expo CLI for mobile development

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd calo-nutrition-app
```

2. **Install dependencies**
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

3. **Set up environment variables**
```bash
# Copy example files
cp server/.env.example server/.env
cp client/.env.example client/.env

# Edit the .env files with your configuration
```

4. **Set up the database**
```bash
cd server
npx prisma generate
npx prisma db push
npm run db:seed
```

5. **Start the development servers**
```bash
# Terminal 1: Start the server
cd server
npm run dev

# Terminal 2: Start the client
cd client
npm start
```

## Device Integration Setup

### Apple Health (iOS)
- Automatically available on iOS devices
- Requires user permission for health data access
- No additional configuration needed

### Google Fit
1. Create a project in Google Cloud Console
2. Enable the Fitness API
3. Create OAuth 2.0 credentials
4. Add your client secret to environment variables:
```bash
EXPO_PUBLIC_GOOGLE_FIT_CLIENT_SECRET="your-secret-here"
```

### Fitbit
1. Register your app at https://dev.fitbit.com/
2. Get your client ID and secret
3. Add to environment variables:
```bash
EXPO_PUBLIC_FITBIT_CLIENT_SECRET="your-secret-here"
```

### Samsung Health (Android)
- Available on Samsung devices with Samsung Health app
- Requires Samsung Health SDK integration
- Currently uses simulated data for demonstration

### Other Devices
Similar OAuth setup required for Garmin, Whoop, and Polar integrations.

## Database Schema

The app uses PostgreSQL with Prisma ORM. Key tables include:

- `User` - User accounts and preferences
- `Meal` - Nutrition data and meal analysis
- `ConnectedDevice` - Device connections and settings
- `DailyActivitySummary` - Activity data from devices
- `UserQuestionnaire` - Health and preference data
- `RecommendedMenu` - AI-generated meal plans

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create account
- `POST /api/auth/signin` - Sign in
- `POST /api/auth/verify-email` - Verify email

### Nutrition
- `POST /api/nutrition/analyze` - Analyze meal photo
- `POST /api/nutrition/save` - Save meal data
- `GET /api/nutrition/meals` - Get user meals
- `GET /api/nutrition/stats/range` - Get nutrition statistics

### Devices
- `GET /api/devices` - Get connected devices
- `POST /api/devices/connect` - Connect new device
- `POST /api/devices/:id/sync` - Sync device data
- `DELETE /api/devices/:id` - Disconnect device

### Meal Plans
- `GET /api/recommended-menus` - Get recommended menus
- `POST /api/recommended-menus/generate` - Generate new menu
- `POST /api/meal-plans/create` - Create custom meal plan

## Configuration

### Required Environment Variables

**Server (.env)**
```bash
DATABASE_URL="postgresql://..."
JWT_SECRET="your-jwt-secret"
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"
```

**Client (.env)**
```bash
EXPO_PUBLIC_API_URL="http://localhost:5000/api"
```

### Optional Environment Variables

**OpenAI Integration**
```bash
OPENAI_API_KEY="your-openai-api-key"
```

**Device Integration**
```bash
EXPO_PUBLIC_GOOGLE_FIT_CLIENT_SECRET="your-google-fit-secret"
EXPO_PUBLIC_FITBIT_CLIENT_SECRET="your-fitbit-secret"
# ... other device secrets
```

## Development

### Running Tests
```bash
# Server tests
cd server
npm test

# Client tests
cd client
npm test
```

### Database Management
```bash
# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# View database
npx prisma studio

# Reset database
npx prisma migrate reset
```

### Building for Production
```bash
# Build server
cd server
npm run build

# Build client
cd client
npm run build
```

## Device Integration Details

### Data Flow
1. User connects device through OAuth or platform permissions
2. Device credentials stored securely in database
3. Background sync pulls activity data every 24 hours
4. Data processed and stored in `DailyActivitySummary` table
5. Calorie balance calculated using nutrition + activity data

### Supported Metrics
- **Steps** - Daily step count
- **Calories Burned** - Active energy expenditure
- **Active Minutes** - Time spent in moderate+ activity
- **Heart Rate** - Average and max heart rate
- **Distance** - Walking/running distance
- **Weight** - Body weight measurements
- **Sleep** - Sleep duration and quality (device dependent)

### Security
- All device tokens encrypted before storage
- OAuth refresh tokens handled automatically
- User data isolated per account
- GDPR compliant data handling

## Troubleshooting

### Common Issues

**Device Connection Fails**
- Check device app is installed and updated
- Verify OAuth credentials in environment variables
- Ensure user granted all required permissions

**Data Not Syncing**
- Check device connection status in app
- Manually trigger sync from devices screen
- Verify device tokens haven't expired

**AI Analysis Not Working**
- Check OpenAI API key is configured
- Verify API key has sufficient credits
- App works with fallback analysis if no API key

### Support
For technical support or questions:
- Check the troubleshooting section above
- Review server logs for error details
- Contact support team with specific error messages

## License

This project is licensed under the MIT License - see the LICENSE file for details.