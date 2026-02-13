export interface BithumbOrderResponse {
  status: string;
  order_id: string;
}

export interface BithumbBorrowResponse {
  status: string;
  data: { loan_id: string; interest: string };
}
