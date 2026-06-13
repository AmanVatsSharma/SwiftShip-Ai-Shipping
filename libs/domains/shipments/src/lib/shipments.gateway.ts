import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ShipmentsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  afterInit(server: Server) {
    console.log('ShipmentsGateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  notifyShipmentUpdate(updatedShipment: any) {
    this.server.emit('shipmentUpdate', updatedShipment);
  }

  notifyLabelCreated(label: any) {
    this.server.emit('labelCreated', label);
  }

  notifyTrackingEvent(event: any) {
    this.server.emit('trackingEvent', event);
  }
} 