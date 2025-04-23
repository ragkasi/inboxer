import { configureStore } from '@reduxjs/toolkit';
import emailReducer from '../redux/emailSlice';

export const store = configureStore({
  reducer: {
    email: emailReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    })
});