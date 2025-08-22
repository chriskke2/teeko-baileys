import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import webhookService from '../../services/webhook.service';

// Standardized error handler
const handleError = (res: Response, error: any, defaultMessage: string, statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR) => {
  console.error(defaultMessage, error);
  const message = error.message || defaultMessage;
  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

export const receiveTaxiData = async (req: Request, res: Response) => {
  console.log("POST /api/webhook/taxi-data");
  try {
    const { customer, taxi, payment } = req.body;
    
    // Validate required fields
    if (!customer) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Customer information is required.' 
      });
    }

    if (!taxi) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Taxi information is required.' 
      });
    }

    if (!payment) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Payment information is required.' 
      });
    }

    // Validate customer fields
    if (!customer.customerName || !customer.phoneNumber || !customer.from || !customer.to) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Customer must include: customerName, phoneNumber, from, to' 
      });
    }

    // Validate taxi fields
    if (!taxi.driverName || !taxi.phoneNumber) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Taxi must include: driverName, phoneNumber' 
      });
    }

    // Validate payment fields
    if (!payment.amount || !payment.receiptNumber) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Payment must include: amount, receiptNumber' 
      });
    }

    // Process the taxi data (for now, just log it)
    await webhookService.processTaxiData({ customer, taxi, payment });
    
    res.status(StatusCodes.OK).json({ 
      success: true, 
      message: 'Taxi data received successfully',
      data: {
        customer: {
          customerName: customer.customerName,
          phoneNumber: customer.phoneNumber,
          from: customer.from,
          to: customer.to
        },
        taxi: {
          driverName: taxi.driverName,
          phoneNumber: taxi.phoneNumber
        },
        payment: {
          amount: payment.amount,
          receiptNumber: payment.receiptNumber
        }
      }
    });
  } catch (error: any) {
    handleError(res, error, 'Error processing taxi data');
  }
};
